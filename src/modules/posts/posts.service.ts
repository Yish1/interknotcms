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

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

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

    if (
      currentUser.role !== 'admin' &&
      currentUser.role !== 'editor'
    ) {
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

    const uniqueTags = tags ? [...new Set(tags)] : [];

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
            }
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

    const orderBy =
      sort === 'views'
        ? { viewCount: 'desc' as const }
        : { publishedAt: 'desc' as const };

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

          author:{
            select: {
              username: true,
              avatar: true,
            }
          },

          tags: {
            select: {
              tag: {
                select: {
                  name: true,
                }
              }
            }
          }
        }
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
    currentUser: { sub: string; role: string, username: string,
    }) 

    {

    if (currentUser.role !== 'admin' && currentUser.role !== 'editor') {
      throw new ForbiddenException('Permission denied');
    }

    const { page, pageSize, status } = query;

    const skip = (page - 1) * pageSize;

    const where: Prisma.PostWhereInput = {
      ...(status === 'archived'
        ? { deletedAt: { not: null } }
        : { deletedAt: null }),

      ...(status === 'draft' || status === 'published'
        ? { status }
        : {}),

      ...(currentUser.role === 'admin'
        ? {}
        : { authorId: currentUser.sub }),
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
            }
          },

          tags: {
            select: {
              tag: {
                select: {
                  name: true,
                }
              }
            }
          }
        }
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

  async listPostsByTag(
    tag: string,
    query: PostListQueryDto,
  ) {
    const {
      page,
      pageSize,
      sort,
    } = query;

    const skip = (page - 1) * pageSize;

    const orderBy =
      sort === 'views'
        ? {
            viewCount: 'desc' as const,
          }
        : {
            publishedAt: 'desc' as const,
          };

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
        tags: post.tags.map(
          (item) => item.tag.name,
        ),
      })),

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(
          total / pageSize,
        ),
      },
    };
  }

}
