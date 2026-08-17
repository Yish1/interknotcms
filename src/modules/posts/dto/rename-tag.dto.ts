import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RenameTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}]+$/u, {
    message: 'Tags can only contain letters and numbers',
  })
  name!: string;
}
