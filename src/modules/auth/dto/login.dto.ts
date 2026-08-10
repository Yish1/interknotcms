import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class LoginDto {
    @IsNotEmpty()
    @IsString()
    @MaxLength(32)
    @MinLength(3)
    @Matches(/^[a-zA-Z0-9_@]+$/, {
      message: 'Username can only contain letters, numbers, underscores, and @ symbols',
    })
    username!: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(8)
    @MaxLength(100)
    password!: string;
}