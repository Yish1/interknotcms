import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @IsUUID()
  authorId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: 'A post can have at most 8 tags' })
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Matches(/^[\p{L}\p{N}]+$/u, {
    each: true,
    message: 'Tags can only contain letters and numbers',
  })
  tags?: string[];
}
