import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreatePostAliasDto } from './dto/create-post-alias.dto.js';

@Controller('posts')
export class PostsController {
    constructor(private readonly postsService: PostsService) { }

    @UseGuards(AuthGuard)
    @Post()
    async create(@Body() createPostDto: CreatePostDto, @Req() req: any) {
        const post = await this.postsService.createPost(createPostDto, req.user);
        return {
            message: 'Post created successfully',
            data: post,
        };
    }

    @Get(':identifier')
    async findOne(@Param('identifier') identifier: string) {
        const post = await this.postsService.findOne(identifier);
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
        @Req() req: any
    ) {
        const post = await this.postsService.CreatePostAlias(
            identifier,
            createPostAliasDto.alias,
            req.user
        );

        return {
            message: 'Post alias created successfully',
            data: post,
        };
    }
}
