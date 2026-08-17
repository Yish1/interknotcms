import { Module } from '@nestjs/common';
import { OptionsController } from './options.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { OptionsService } from './options.service.js';


@Module({
  imports: [AuthModule],
  controllers: [OptionsController],
  providers: [OptionsService],
  exports: [OptionsService],
})
export class OptionsModule {}
