import {
  Body,
  Controller,
  Param,
  Post,
  Get,
  Req,
  UseGuards,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/comment.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { LogThrottlerGuard } from '../../common/guards/log-throttler.guard.js';
import { Throttle } from '@nestjs/throttler';
import { CommentListQueryDto } from './dto/comment-list-query.dto.js';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @UseGuards(AuthGuard, LogThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('post/:identifier')
  async createComment(
    // POST /api/comments/post/:identifier
    @Param('identifier') identifier: string,
    @Body() createCommentDto: CreateCommentDto,
    @Req() req: any,
  ) {
    const comment = await this.commentsService.createComment(
      identifier,
      createCommentDto,
      req.user,
      req.ip,
    );

    return {
      message: 'Comment created successfully',
      data: comment,
    };
  }

  @Get('post/:identifier')
  async listPostComments(
    @Param('identifier') identifier: string,
    @Query() query: CommentListQueryDto,
  ) {
    const result = await this.commentsService.listPostComments(
      identifier,
      query,
    );

    return {
      message: 'Comments retrieved successfully',
      data: result.comments,
      pagination: result.pagination,
    };
  }

  @Get('pending')
  @UseGuards(AuthGuard)
  async listPendingComments(@Req() req: any) {
    const comments = await this.commentsService.listPendingComments(req.user);

    return {
      message: 'Pending comments retrieved successfully',
      data: comments,
    };
  }

  @Post('approve/:commentId')
  @UseGuards(AuthGuard)
  async approveComment(
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Req() req: any,
  ) {
    const comment = await this.commentsService.approveComment(
      commentId,
      req.user,
    );

    return {
      message: 'Comment approved successfully',
      data: comment,
    };
  }

  @Delete(':commentId')
  @UseGuards(AuthGuard)
  async deleteComment(
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Req() req: any,
  ) {
    const comment = await this.commentsService.deleteComment(
      commentId,
      req.user,
    );

    return {
      message: 'Comment deleted successfully',
      data: comment,
    };
  }
}
