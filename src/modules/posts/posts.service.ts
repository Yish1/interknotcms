import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { randomBytes } from 'node:crypto';
import { PostListQueryDto } from './dto/post-list-query.dto.js';
import { ManagePostQueryDto } from './dto/post-list-query-manage.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  private deduplicateTags(tags: string[]): string[] {
    const seen = new Set<string>();

    return tags.filter((tag) => {
      const normalizedTag = tag.toLocaleLowerCase();

      if (seen.has(normalizedTag)) {
        return false;
      }

      seen.add(normalizedTag);
      return true;
    });
  }

  private generatePublicId(): string {
    const chars = '0oO';
    const bytes = randomBytes(13); // 159万种组合任君选择

    let result = '0d';

    for (const byte of bytes) {
      result += chars[byte % chars.length];
    }

    return result;
  }

  // 生成唯一 publicId
  private async generateUniquePublicId(): Promise<string> {
    while (true) {
      const publicId = this.generatePublicId();

      const existingPost = await this.prisma.post.findUnique({
        where: {
          publicId,
        },
      });

      if (!existingPost) {
        return publicId;
      }
    }
  }

  async createPost(
    createPostDto: CreatePostDto,
    currentUser: {
      sub: string;
      role: string;
    },
  ) {
    const { authorId, tags, status, ...postData } = createPostDto; // 取出三个值，剩下的属性放在 postData 中

    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    if (authorId && currentUser.role !== 'admin') {
      // 普通用户不能指定作者
      throw new ForbiddenException('Permission denied');
    }

    const finalAuthorId = authorId ?? currentUser.sub; // 管理员指定了 authorId 就使用指定作者

    // 检查作者是否存在且有效
    const author = await this.prisma.user.findFirst({
      where: {
        id: finalAuthorId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!author) {
      throw new BadRequestException('Invalid author');
    }

    const publicId = await this.generateUniquePublicId(); // 生成唯一的 publicId

    const uniqueTags = tags ? this.deduplicateTags(tags) : [];

    const post = await this.prisma.post.create({
      data: {
        ...postData,
        publicId,
        status,
        publishedAt: status === 'published' ? new Date() : null,
        author: {
          connect: { id: finalAuthorId }, // 关联作者
        },
        tags: uniqueTags.length
          ? {
              create: uniqueTags.map((tag) => ({
                tag: {
                  connectOrCreate: {
                    where: { name: tag },
                    create: { name: tag },
                  },
                },
              })),
            }
          : undefined, // 如果有标签就关联标签，否则不关联
      },
    });

    return post;
  }

  async findOne(
    identifier: string,
    currentUser?: {
      sub: string;
      role: string;
    },
  ) {
    const post = await this.prisma.post.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { publicId: identifier },
          { aliases: { some: { alias: identifier } } },
        ],
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },

        aliases: true,

        tags: {
          include: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (
      post.status === 'draft' &&
      currentUser?.role !== 'admin' &&
      currentUser?.sub !== post.authorId
    ) {
      throw new NotFoundException('Post not found');
    }

    return { ...post, tags: post.tags.map((t) => t.tag.name) };
  }

  async createPostAlias(
    identifier: string,
    alias: string,
    currentUser: {
      sub: string;
      role: string;
    },
  ) {
    const post = await this.findOne(identifier, currentUser);

    if (currentUser.role !== 'admin' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    const publicIdConflict = await this.prisma.post.findUnique({
      where: {
        publicId: alias,
      },
    });

    if (publicIdConflict) {
      // 避免 alias 与现有的 publicId 冲突
      throw new ConflictException('Alias conflicts with an existing publicId');
    }

    try {
      const postAlias = await this.prisma.postAlias.create({
        data: {
          alias,
          post: {
            connect: { id: post.id },
          },
        },
      });

      return postAlias;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Alias already exists');
      }
      throw error;
    }
  }

  async ListPublicPosts(query: PostListQueryDto) {
    const { page, pageSize, sort } = query;

    const skip = (page - 1) * pageSize;

    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      sort === 'views'
        ? [{ viewCount: 'desc' }, { updatedAt: 'desc' }]
        : [{ publishedAt: 'desc' }, { updatedAt: 'desc' }];

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          status: 'published',
          deletedAt: null,
        },
        orderBy,
        skip,
        take: pageSize,

        select: {
          publicId: true,
          title: true,
          summary: true,
          publishedAt: true,
          viewCount: true,

          author: {
            select: {
              username: true,
              avatar: true,
            },
          },

          tags: {
            select: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.post.count({
        where: {
          status: 'published',
          deletedAt: null,
        },
      }),
    ]);

    return {
      posts: posts.map((post) => ({
        ...post,
        tags: post.tags.map((t) => t.tag.name),
      })),

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async listManagePosts(
    query: ManagePostQueryDto,
    currentUser: { sub: string; role: string; username: string },
  ) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    const { page, pageSize, status } = query;

    const skip = (page - 1) * pageSize;

    const where: Prisma.PostWhereInput = {
      ...(status === 'archived'
        ? { deletedAt: { not: null } }
        : { deletedAt: null }),

      ...(status === 'draft' || status === 'published' ? { status } : {}),

      ...(currentUser.role === 'admin' ? {} : { authorId: currentUser.sub }),
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,

        select: {
          publicId: true,
          title: true,
          summary: true,
          status: true,
          viewCount: true,
          createdAt: true,
          publishedAt: true,
          updatedAt: true,
          deletedAt: true,

          author: {
            select: {
              username: true,
              avatar: true,
            },
          },

          tags: {
            select: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.post.count({ where }),
    ]);

    return {
      posts: posts.map((post) => ({
        ...post,
        tags: post.tags.map((t) => t.tag.name),
      })),

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async listPostsByTag(tag: string, query: PostListQueryDto) {
    const { page, pageSize, sort } = query;

    const skip = (page - 1) * pageSize;

    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      sort === 'views'
        ? [{ viewCount: 'desc' }, { updatedAt: 'desc' }]
        : [{ publishedAt: 'desc' }, { updatedAt: 'desc' }];

    const where: Prisma.PostWhereInput = {
      status: 'published',
      deletedAt: null,

      tags: {
        some: {
          tag: {
            name: tag,
          },
        },
      },
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,

        select: {
          publicId: true,
          title: true,
          summary: true,
          viewCount: true,
          publishedAt: true,

          author: {
            select: {
              username: true,
              avatar: true,
            },
          },

          tags: {
            select: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.post.count({
        where,
      }),
    ]);

    return {
      posts: posts.map((post) => ({
        ...post,
        tags: post.tags.map((item) => item.tag.name),
      })),

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async renameTag(oldTag: string, newTag: string, currentUser: { sub: string; role: string })
   {

    if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Permission denied');
    }

    if (oldTag === newTag) {
      throw new BadRequestException('New tag name must be different');
    }

    const ifOldTag = await this.prisma.tag.findUnique({
      where: {
        name: oldTag,
      },
      select: {
        name: true,
      },
    });

    if (!ifOldTag) {
      throw new NotFoundException('Old tag not found');
    }

    const ifNewTag = await this.prisma.tag.findUnique({
      where: {
        name: newTag,
      },
      select: {
        name: true,
      },
    });

    if (ifNewTag) {
      throw new ConflictException('New tag name already exists');
    }

    return this.prisma.tag.update({
      where: { name: oldTag },
      data: { name: newTag },
    });
  }

  async deleteTag(tag: string, currentUser: { sub: string; role: string }) {
    if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Permission denied');
    }

    const ifTag = await this.prisma.tag.findUnique({
      where: {
        name: tag,
      },
      select: {
        id: true,
      },
    });

    if (!ifTag) {
      throw new NotFoundException('Tag not found');
    }

    return this.prisma.tag.delete({
      where: { id: ifTag.id },
      select: {
        name: true,
      },
    });

  }

  async deletePost(
    identifier: string,
    currentUser: {
      sub: string;
      role: string;
    },
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
        authorId: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    if (currentUser.role == 'editor' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    return this.prisma.post.update({
      where: { id: post.id },
      data: {
        deletedAt: new Date(),
      },
      select: {
        publicId: true,
        title: true,
        deletedAt: true,
      },
    });
  }

  async deletePostPermanently(
    identifier: string,
    currentUser: {
      sub: string;
      role: string;
    },
  ) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    const post = await this.prisma.post.findFirst({
      where: {
        deletedAt: { not: null },
        OR: [
          { publicId: identifier },
          { aliases: { some: { alias: identifier } } },
        ],
      },

      select: {
        id: true,
        authorId: true,
        publicId: true,
        title: true,
      },
    });

    if (!post) {
      throw new NotFoundException(
        'Post not found or page need add into trashbin first',
      );
    }

    if (currentUser.role == 'editor' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    await this.prisma.post.delete({
      where: { id: post.id },
    });

    return {
      publicId: post.publicId,
      title: post.title,
    };
  }

  async restorePost(
    identifier: string,
    currentUser: {
      sub: string;
      role: string;
    },
  ) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    const post = await this.prisma.post.findFirst({
      where: {
        deletedAt: { not: null },
        OR: [
          { publicId: identifier },
          { aliases: { some: { alias: identifier } } },
        ],
      },

      select: {
        id: true,
        authorId: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (currentUser.role == 'editor' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    return this.prisma.post.update({
      where: { id: post.id },
      data: {
        deletedAt: null,
      },
      select: {
        publicId: true,
        title: true,
        deletedAt: true,
      },
    });
  }

  async updatePost(
    identifier: string,
    updatePostDto: UpdatePostDto,
    currentUser: { sub: string; role: string },
  ) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

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
        authorId: true,
        status: true,
        publishedAt: true,
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    if (currentUser.role !== 'admin' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    const { authorId, tags, status, ...postData } = updatePostDto;

    if (authorId && currentUser.role !== 'admin') {
      throw new ForbiddenException('Permission denied');
    }

    if (authorId) {
      const author = await this.prisma.user.findFirst({
        where: {
          id: authorId,
          deletedAt: null,
          isActive: true,
        },
      });

      if (!author) throw new BadRequestException('Invalid author');
    }

    let publishedAt = post.publishedAt;

    if (status === 'published' && post.status !== 'published') {
      publishedAt = new Date();
    }

    if (status === 'draft' && post.status === 'published') {
      publishedAt = null;
    }

    const uniqueTags =
      tags !== undefined ? this.deduplicateTags(tags) : undefined;

    const updatedPost = await this.prisma.post.update({
      where: { id: post.id },

      data: {
        ...postData,

        ...(status ? { status, publishedAt } : {}),

        ...(authorId
          ? {
              author: {
                connect: { id: authorId },
              },
            }
          : {}),

        ...(uniqueTags !== undefined
          ? {
              tags: {
                deleteMany: {},
                create: uniqueTags.map((tag) => ({
                  tag: {
                    connectOrCreate: {
                      where: { name: tag },
                      create: { name: tag },
                    },
                  },
                })),
              },
            }
          : {}),
      },

      select: {
        publicId: true,
        title: true,
        content: true,
        summary: true,
        status: true,
        viewCount: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,

        author: {
          select: {
            username: true,
            avatar: true,
          },
        },

        tags: {
          select: {
            tag: {
              select: { name: true },
            },
          },
        },
      },
    });

    return {
      ...updatedPost,
      tags: updatedPost.tags.map((item) => item.tag.name),
    };
  }

  async deletePostAlias(
    identifier: string,
    alias: string,
    currentUser: { sub: string; role: string },
  ) {

    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

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
        authorId: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (currentUser.role !== 'admin' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    const postAlias = await this.prisma.postAlias.findFirst({
      where: {
        postId: post.id,
        alias,
      },
    });

    if (!postAlias) {
      throw new NotFoundException('Alias not found');
    }

    return this.prisma.postAlias.delete({
      where: { id: postAlias.id },
      select: {
        alias: true,
      },
    });
  }

  async renamePostAlias(
    identifier: string,
    oldAlias: string,
    newAlias: string,
    currentUser: { sub: string; role: string },
  ) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    if (oldAlias === newAlias) {
      throw new BadRequestException('New alias must be different from old alias');
    }

    const post = await this.prisma.post.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { publicId: identifier },
          { aliases: { some: { alias: identifier } } },
        ],
      },
      select: { id: true, authorId: true },
    });

    if (!post) throw new NotFoundException('Post not found');

    if (currentUser.role !== 'admin' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    const postAlias = await this.prisma.postAlias.findFirst({
      where: { postId: post.id, alias: oldAlias },
      select: { id: true },
    });

    if (!postAlias) throw new NotFoundException('Old alias not found');

    const existingAlias = await this.prisma.postAlias.findUnique({
      where: { alias: newAlias },
    });

    if (existingAlias) {
      throw new ConflictException('New alias already exists');
    }

    const publicIdConflict = await this.prisma.post.findUnique({
      where: { publicId: newAlias },
    });

    if (publicIdConflict) {
      throw new ConflictException('New alias conflicts with an existing publicId');
    }

    return this.prisma.postAlias.update({
      where: { id: postAlias.id },
      data: { alias: newAlias },
      select: { alias: true },
    });
  }

  async listPostAliases(
    identifier: string,
    currentUser: { sub: string; role: string },
  ){

    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

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
        authorId: true,
        aliases: {
          select: {
            alias: true,
          },
        },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    return post.aliases.map((a) => a.alias);

  }


}
