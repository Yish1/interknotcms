import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateCommentDto } from './dto/comment.dto.js';
import { CommentListQueryDto } from './dto/comment-list-query.dto.js';

export interface PublicCommentNode {
  id: string;
  content: string | null;
  parentId: string | null;
  createdAt: Date;
  deleted: boolean;
  user: {
    username: string | null;
    avatar: string | null;
  };
  replies: PublicCommentNode[];
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createComment(
    identifier: string,
    createCommentDto: CreateCommentDto,
    currentUser: { sub: string; role: string },
    ip: string,
  ) {
    const post = await this.prisma.post.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { publicId: identifier },
          { aliases: { some: { alias: identifier } } },
        ],
      },
      select: {
        id: true,
        status: true,
        authorId: true,
      },
    });

    if (!post || post.status !== 'published') {
      throw new NotFoundException('Post not found');
    }

    const { parentId, content } = createCommentDto;

    if (parentId) {
      const parentComment = await this.prisma.comment.findFirst({
        where: {
          id: parentId,
          postId: post.id,
          status: 'approved',
          deletedAt: null,
        },
      });

      if (!parentComment || parentComment.postId !== post.id) {
        throw new BadRequestException('Invalid parent comment');
      }
    }

    const reviewOption = await this.prisma.option.findFirst({
      where: { key: 'comment_review_required' },
      select: { value: true },
    });

    const needapprove =
      currentUser.role === 'admin' || (currentUser.role === 'editor' && currentUser.sub === post.authorId);
    // 只接受 JSON 布尔值；配置缺失或类型错误时默认需要审批。
    const reviewRequired = reviewOption?.value !== false;
    const commentStatus = reviewRequired && !needapprove ? 'pending' : 'approved';

    return await this.prisma.comment.create({
      data: {
        content,
        ip,
        status: commentStatus,
        user: {
          connect: { id: currentUser.sub },
        },
        post: {
          connect: { id: post.id },
        },
        ...(parentId ? { parent: { connect: { id: parentId } } } : {}),
      },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        parentId: true,
        user: {
          select: {
            username: true,
            avatar: true,
          },
        },
      },
    });
  }

  async listPostComments(identifier: string, query: CommentListQueryDto) {
    const { page, pageSize } = query;

    const skip = (page - 1) * pageSize;

    const commentselect = {
      id: true,
      content: true,
      parentId: true,
      createdAt: true,
      deletedAt: true,
      user: {
        select: {
          username: true,
          avatar: true,
        },
      },
    } as const;

    const post = await this.prisma.post.findFirst({
      where: {
        deletedAt: null,
        status: 'published',
        OR: [
          { publicId: identifier },
          { aliases: { some: { alias: identifier } } },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const rootWhere = {
      postId: post.id,
      parentId: null,
      status: 'approved' as const,
    };

    const [rootComments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: rootWhere,
        orderBy: [{createdAt: 'asc'}, {id: 'asc'}],
        skip,
        take: pageSize,
        select: commentselect,
      }),
      this.prisma.comment.count({
        where: rootWhere,
      }),
    ]);

    const comments = [...rootComments];

    let parentIds = rootComments.map((comment) => comment.id);

    while (parentIds.length > 0) {
      const replies = await this.prisma.comment.findMany({
        where: {
          postId: post.id,
          parentId: { in: parentIds },
          status: 'approved',
        },
        orderBy: [{createdAt: 'asc'}, {id: 'asc'}],
        select: commentselect,
      })

      comments.push(...replies);
      parentIds = replies.map((comment) => comment.id);
    }


    const commentMap = new Map<string, PublicCommentNode>();

    for (const comment of comments) {
      const node: PublicCommentNode = {
        id: comment.id,
        content: comment.deletedAt ? null : comment.content,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        deleted: comment.deletedAt !== null,
        user: comment.user,
        replies: [],
      };

      commentMap.set(comment.id, node);
    }

    const roots: PublicCommentNode[] = [];

    for (const comment of commentMap.values()) {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);

        if (parent) {
          parent.replies.push(comment);
          continue;
        }
      }

      roots.push(comment);
    }

    const totalPages = Math.ceil(total / pageSize);

    return {
      comments: roots,
      pagination: {
        total,
        page,
        pageSize,
        totalPages,
      },
    }
}

  async listPendingComments(currentUser: { sub: string; role: string }) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    return await this.prisma.comment.findMany({
      where: {
        status: 'pending',
        deletedAt: null,
        ...(currentUser.role === 'admin' // admin能看所有待审核评论，editor只能看自己文章的评论
          ? {}
          : { post: { authorId: currentUser.sub } }),
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        parentId: true,
        post: {
          select: {
            publicId: true,
            title: true,
          },
        },
        user: {
          select: {
            username: true,
          },
        },
      },
    });
  }

  async approveComment(
    commentId: string,
    currentUser: { sub: string; role: string },
  ) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        status: 'pending',
        deletedAt: null,
        ...(currentUser.role === 'admin' // admin能审核所有待审核评论，editor只能审核自己文章的评论
          ? {}
          : { post: { authorId: currentUser.sub } }),
      },
      select: {
        id: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found or not pending');
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { status: 'approved' },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    });
  }

  async deleteComment(
    commentId: string,
    currentUser: { sub: string; role: string },
  ) {
    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        post: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found or already deleted');
    }

    const canDelete =
      currentUser.role === 'admin' ||
      comment.userId === currentUser.sub ||
      (currentUser.role === 'editor' &&
        comment.post.authorId === currentUser.sub);

    if (!canDelete) {
      throw new ForbiddenException('Permission denied');
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    });
  }
}
