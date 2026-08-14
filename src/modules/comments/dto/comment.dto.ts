import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCommentDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/u, { message: 'Comment content cannot be blank' })
  content!: string;
  
}
