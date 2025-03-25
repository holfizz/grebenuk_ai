import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log", "debug", "verbose"],
  });

  app.enableCors({
    origin: true, // Разрешаем все origins в dev режиме
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: ["Content-Type", "Accept", "Telegram-Data"],
    credentials: false, // Отключаем credentials
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe());

  // Настраиваем Swagger для документации API
  const config = new DocumentBuilder().setTitle("Tasks API").setDescription("The tasks API description").setVersion("1.0").build();

  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0", () => {
    console.log(`Server is running on port ${port}`);
  });
}

bootstrap();
