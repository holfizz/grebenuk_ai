import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { GrebenukBotModule } from "./grebenuk-bot/grebenuk-bot.module";
import { PrismaModule } from "./prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HttpModule,
    GrebenukBotModule,
  ],
})
export class AppModule {}
