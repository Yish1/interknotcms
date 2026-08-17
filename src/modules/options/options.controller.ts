import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { OptionsService } from './options.service.js';
import { OptionKeyDto, OptionsDto } from './dto/options.dto.js';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('options')
@UseGuards(AuthGuard)
@ApiBearerAuth('access-token')
export class OptionsController {
  constructor(private readonly optionsService: OptionsService) {}

  @Get(':key')
  async getOption(@Param() optionKeyDto: OptionKeyDto, @Req() req: any) {
    const option = await this.optionsService.getOption(
      optionKeyDto.key,
      req.user,
    );

    return {
      message: 'Option retrieved successfully',
      data: option,
    };
  }

  @Put(':key')
  async setOption(
    @Param() optionKeyDto: OptionKeyDto,
    @Body() optionsDto: OptionsDto,
    @Req() req: any,
  ) {
    const option = await this.optionsService.setOption(
      optionKeyDto.key,
      optionsDto.value,
      req.user,
    );

    return {
      message: 'Option saved successfully',
      data: option,
    };
  }

  @Delete(':key')
  async deleteOption(@Param() optionKeyDto: OptionKeyDto, @Req() req: any) {
    const option = await this.optionsService.deleteOption(
      optionKeyDto.key,
      req.user,
    );

    return {
      message: 'Option deleted successfully',
      data: option,
    };
  }

  @Get()
  async getAllOptions(@Req() req: any) {
    const options = await this.optionsService.getAllOptions(req.user);

    return {
      message: 'Options retrieved successfully',
      data: options,
    };
  }
}
