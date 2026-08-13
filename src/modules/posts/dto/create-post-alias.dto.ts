import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePostAliasDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^(?!0d)/, {
    message: 'Alias cannot start with 0d',
  })
  alias!: string;
}
