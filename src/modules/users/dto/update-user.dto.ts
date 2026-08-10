import { IsEmail, IsOptional, IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateUserDto {
    @IsNotEmpty()
    @IsOptional()
    @IsString()
    @MaxLength(32)
    @MinLength(3)
    @Matches(/^[a-zA-Z0-9_@]+$/, {
      message: 'Username can only contain letters, numbers, underscores, and @ symbols',
    })
    username?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @IsOptional()
    @IsString()
    @MinLength(8)
    @MaxLength(100)
    password?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    avatar?: string;
}