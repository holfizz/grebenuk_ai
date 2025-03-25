import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TelegrafModule } from "nestjs-telegraf";
import { PrismaModule } from "../prisma.module";
import { GrebenukBotController } from "./grebenuk-bot.controller";
import { GrebenukBotService } from "./grebenuk-bot.service";
import { GrebenukTelegramCommands } from "./grebenuk-telegram.commands";
import { GrebenukTelegramUpdate } from "./grebenuk-telegram.update";

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    ConfigModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>("TELEGRAM_BOT_TOKEN"),
        include: [GrebenukBotModule],
      }),
    }),
  ],
  controllers: [GrebenukBotController],
  providers: [GrebenukBotService, GrebenukTelegramUpdate, GrebenukTelegramCommands],
  exports: [GrebenukBotService],
})
export class GrebenukBotModule {}
