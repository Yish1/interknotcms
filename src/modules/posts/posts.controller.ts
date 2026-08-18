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
import { RenameTagDto } from './dto/rename-tag.dto.js';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(AuthGuard, LogThrottlerGuard)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  async create(@Body() createPostDto: CreatePostDto, @Req() req: any) {
    const post = await this.postsService.createPost(createPostDto, req.user);
    return {
      message: 'Post created successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard, LogThrottlerGuard)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':identifier/aliases')
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

  @Get() // api/posts?page=x&pageSize=xx&sort=latest, views or updated
  async listPublicPosts(@Query() query: PostListQueryDto) {
    const posts = await this.postsService.ListPublicPosts(query);
    return {
      message: 'Public posts retrieved successfully',
      data: posts.posts,
      pagination: posts.pagination,
    };
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @Get('manage') //
  async listManagePosts(@Req() req: any, @Query() query: ManagePostQueryDto) {
    const result = await this.postsService.listManagePosts(query, req.user);

    return {
      message: 'Manage posts retrieved successfully',
      data: result.posts,
      pagination: result.pagination,
    };
  }

  @Get('tags/:tag/posts')
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
  @ApiBearerAuth('access-token')
  @Delete(':identifier')
  async deletePost(@Param('identifier') identifier: string, @Req() req: any) {
    const post = await this.postsService.deletePost(identifier, req.user);
    return {
      message: 'Post deleted successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @Patch(':identifier/restore')
  async restorePost(@Param('identifier') identifier: string, @Req() req: any) {
    const post = await this.postsService.restorePost(identifier, req.user);
    return {
      message: 'Post restored successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
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
  @ApiBearerAuth('access-token')
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
  @ApiBearerAuth('access-token')
  @Delete(':identifier/aliases/:alias')
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
  @ApiBearerAuth('access-token')
  @Patch(':identifier/aliases/:alias')
  async renamePostAlias(
    @Param('identifier') identifier: string,
    @Param('alias') oldAlias: string,
    @Body() updatePostAliasDto: CreatePostAliasDto,
    @Req() req: any,
  ) {
    const post = await this.postsService.renamePostAlias(
      identifier,
      oldAlias,
      updatePostAliasDto.alias,
      req.user,
    );
    return {
      message: 'Post alias renamed successfully',
      data: post,
    };
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
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
  @ApiBearerAuth('access-token')
  @Patch('tags/:tag')
  async renameTag(
    @Param('tag') tag: string,
    @Body() renameTagDto: RenameTagDto,
    @Req() req: any,
  ) {
    const result = await this.postsService.renameTag(
      tag,
      renameTagDto.name,
      req.user,
    );
    return {
      message: 'Tag renamed successfully',
      data: result,
    };
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('tags/:tag')
  async deleteTag(@Param('tag') tag: string, @Req() req: any) {
    const result = await this.postsService.deleteTag(tag, req.user);
    return {
      message: 'Tag deleted successfully',
      data: result,
    };
  }

  @Get('tags')
  async listAllTags(@Query() query: PostListQueryDto) {
    const result = await this.postsService.listAllTags(query);
    return {
      message: 'All tags retrieved successfully',
      data: result.tags,
      pagination: result.pagination,
    };
  }

  @UseGuards(OptionalAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':identifier')
  async findOne(@Param('identifier') identifier: string, @Req() req: any) {
    const post = await this.postsService.findOne(identifier, req.user);
    return {
      message: 'Post retrieved successfully',
      data: post,
    };
  }
}
