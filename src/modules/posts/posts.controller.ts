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
import { Throttle } from '@nestjs/throttler';
import { LogThrottlerGuard } from '../../common/guards/log-throttler.guard.js';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(AuthGuard, LogThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  @UseGuards(AuthGuard, LogThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  @UseGuards(AuthGuard)
  @Delete(':identifier/alias/:alias')
  async deletePostAlias(
    @Param('identifier') identifier: string,
    @Param('alias') alias: string,
    @Req() req: any,
  ) {
    const post = await this.postsService.deletePostAlias(
      identifier,
      alias,
      req.user,
    );
    return {
      message: 'Post alias deleted successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @Patch(':identifier/alias/:oldAlias/rename/:newAlias')
  async renamePostAlias(
    @Param('identifier') identifier: string,
    @Param('oldAlias') oldAlias: string,
    @Param('newAlias') newAlias: string,
    @Req() req: any,
  ) {
    const post = await this.postsService.renamePostAlias(
      identifier,
      oldAlias,
      newAlias,
      req.user,
    );
    return {
      message: 'Post alias renamed successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @Get(':identifier/aliases')
  async listPostAliases(
    @Param('identifier') identifier: string,
    @Req() req: any,
  ) {
    const aliases = await this.postsService.listPostAliases(
      identifier,
      req.user,
    );
    return {
      message: 'Post aliases retrieved successfully',
      data: aliases,
    };
  }

  @UseGuards(AuthGuard)
  @Patch('tag/:oldTag/rename/:newTag')
  async renameTag(
    @Param('oldTag') oldTag: string,
    @Param('newTag') newTag: string,
    @Req() req: any,
  ) {
    const result = await this.postsService.renameTag(oldTag, newTag, req.user);
    return {
      message: 'Tag renamed successfully',
      data: result,
    };
  }

  @UseGuards(AuthGuard)
  @Delete('tag/:tag')
  async deleteTag(@Param('tag') tag: string, @Req() req: any) {
    const result = await this.postsService.deleteTag(tag, req.user);
    return {
      message: 'Tag deleted successfully',
      data: result,
    };
  }

  @Get('tags')
  async listAllTags() {
    const tags = await this.postsService.listAllTags();
    return {
      message: 'All tags retrieved successfully',
      data: tags,
    };
  }
}
