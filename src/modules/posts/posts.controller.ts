import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  Query,
  Delete,
  Patch,
} from '@nestjs/common';
import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.js';
import { CreatePostAliasDto } from './dto/create-post-alias.dto.js';
import { PostListQueryDto } from './dto/post-list-query.dto.js';
import { ManagePostQueryDto } from './dto/post-list-query-manage.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(AuthGuard)
  @Post()
  async create(@Body() createPostDto: CreatePostDto, @Req() req: any) {
    const post = await this.postsService.createPost(createPostDto, req.user);
    return {
      message: 'Post created successfully',
      data: post,
    };
  }

  @UseGuards(OptionalAuthGuard)
  @Get('get/:identifier')
  async findOne(@Param('identifier') identifier: string, @Req() req: any) {
    const post = await this.postsService.findOne(identifier, req.user);
    return {
      message: 'Post retrieved successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @Post(':identifier/alias')
  async createPostAlias(
    @Param('identifier') identifier: string,
    @Body() createPostAliasDto: CreatePostAliasDto,
    @Req() req: any,
  ) {
    const post = await this.postsService.createPostAlias(
      identifier,
      createPostAliasDto.alias,
      req.user,
    );

    return {
      message: 'Post alias created successfully',
      data: post,
    };
  }

  @Get() // api/posts?page=x&pageSize=xx&sort=latest or views
  async listPublicPosts(@Query() query: PostListQueryDto) {
    const posts = await this.postsService.ListPublicPosts(query);
    return {
      message: 'Public posts retrieved successfully',
      data: posts,
    };
  }

  @UseGuards(AuthGuard)
  @Get('manage') //
  async listManagePosts(@Req() req: any, @Query() query: ManagePostQueryDto) {
    const result = await this.postsService.listManagePosts(query, req.user);

    return {
      message: 'Manage posts retrieved successfully',
      data: result.posts,
      pagination: result.pagination,
    };
  }

  @Get('tag/:tag') // api/posts/tag/:tag?page=x&pageSize=xx&sort=latest or views
  async listPostsByTag(
    @Param('tag') tag: string,
    @Query() query: PostListQueryDto,
  ) {
    const posts = await this.postsService.listPostsByTag(tag, query);
    return {
      message: 'Posts by tag retrieved successfully',
      data: posts.posts,
      pagination: posts.pagination,
    };
  }

  @UseGuards(AuthGuard)
  @Delete(':identifier')
  async deletePost(@Param('identifier') identifier: string, @Req() req: any) {
    const post = await this.postsService.deletePost(identifier, req.user);
    return {
      message: 'Post deleted successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @Patch(':identifier/restore')
  async restorePost(@Param('identifier') identifier: string, @Req() req: any) {
    const post = await this.postsService.restorePost(identifier, req.user);
    return {
      message: 'Post restored successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @Delete(':identifier/permanent')
  async deletePostPermanently(
    @Param('identifier') identifier: string,
    @Req() req: any,
  ) {
    const post = await this.postsService.deletePostPermanently(
      identifier,
      req.user,
    );
    return {
      message: 'Post permanently deleted successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @Patch(':identifier')
  async updatePost(
    @Param('identifier') identifier: string,
    @Body() updatePostDto: UpdatePostDto,
    @Req() req: any,
  ) {
    const post = await this.postsService.updatePost(
      identifier,
      updatePostDto,
      req.user,
    );
    return {
      message: 'Post updated successfully',
      data: post,
    };
  }
}
