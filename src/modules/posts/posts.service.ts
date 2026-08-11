import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from '../../generated/prisma/client.js';
import { CreatePostDto } from "./dto/create-post.dto.js";
import { randomBytes } from 'node:crypto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) { }

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
    }
  ) {
    const {
      authorId,
      tags,
      status,
      ...postData
    } = createPostDto; // 取出三个值，剩下的属性放在 postData 中

    if (authorId && currentUser.role !== 'admin') { // 普通用户不能指定作者
      throw new ForbiddenException('Permission denied');
    }

    const finalAuthorId = authorId ?? currentUser.sub; // 管理员指定了 authorId 就使用指定作者

    // 检查作者是否存在
    const author = await this.prisma.user.findUnique({
      where: { id: finalAuthorId },
    });

    if (!author) {
      throw new BadRequestException('Author not found');
    }

    const publicId = await this.generateUniquePublicId(); // 生成唯一的 publicId

    const uniqueTags = tags
      ? [...new Set(tags)]
      : [];

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
                  where:
                    { name: tag },
                  create:
                    { name: tag },
                }
              }
            }
            ))
          }
          : undefined, // 如果有标签就关联标签，否则不关联
      },
    });

    return post;
  }

  async findOne(identifier: string) {
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
            tag: true,
          },
        },
      },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  async CreatePostAlias(
    identifier: string, 
    alias: string,
    currentUser: {
      sub: string;
      role: string;
    }
  ) {
    const post = await this.findOne(identifier);

    if (currentUser.role !== 'admin' && post.authorId !== currentUser.sub) {
      throw new ForbiddenException('Permission denied');
    }

    const publicIdConflict = await this.prisma.post.findUnique({
      where: {
        publicId: alias,
      },
    });

    if (publicIdConflict) { // 避免 alias 与现有的 publicId 冲突
      throw new ConflictException('Alias conflicts with an existing publicId'); 
    }

    try {
      const CreatePostAlias = await this.prisma.postAlias.create({
        data: {
          alias,
          post: {
            connect: { id: post.id },
          },
        },
      });

      return CreatePostAlias;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') 
        {
          throw new ConflictException('Alias already exists');
        }
      throw error;
    }
  }
}