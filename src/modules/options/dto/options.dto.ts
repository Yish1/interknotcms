import {
  Allow,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export type JsonValue =
  string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

export class OptionKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z][A-Za-z0-9._-]*$/, {
    message: 'Individual option keys name',
  })
  key!: string;
}

export class OptionsDto {
  @Allow()
  @IsOptional()
  value?: JsonValue;
}
