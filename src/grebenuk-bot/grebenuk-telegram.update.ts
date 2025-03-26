import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import * as fs from "fs";
import { Action, Ctx, Hears, InjectBot, On, Update } from "nestjs-telegraf";
import * as os from "os";
import * as path from "path";
import { Context, Markup, Telegraf } from "telegraf";
import { PrismaService } from "../prisma.service";
import { GrebenukBotService } from "./grebenuk-bot.service";

interface SessionData {
  userId: string;
  telegramId: string;
  currentObjectionId?: string;
  currentObjectionText?: string;
  currentCategoryId?: string;
  awaitingObjectionTopic: boolean;
  lastVoiceText?: string;
  hasAnsweredCurrentObjection?: boolean;
  currentObjectionErrors?: string[];
  currentGrebenukResponse?: string;
  state?: "awaiting_objection_topic" | "awaiting_response";
}

interface TelegrafContext extends Context {
  session?: SessionData;
}

@Update()
@Injectable()
export class GrebenukTelegramUpdate {
  private readonly logger = new Logger(GrebenukTelegramUpdate.name);
  private readonly sessions: Map<number, SessionData> = new Map();
  private readonly tempDir: string;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly prisma: PrismaService,
    private readonly grebenukBotService: GrebenukBotService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.tempDir = path.join(os.tmpdir(), "grebenuk-bot");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  @Hears("/start")
  async onStart(ctx: Context) {
    const telegramId = ctx.from.id.toString();

    try {
      // Проверяем, существует ли пользователь
      let user = await this.prisma.user.findUnique({
        where: { telegramId },
      });

      // Если пользователя нет, создаем его
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            telegramId,
          },
        });
      }

      // Сохраняем данные сессии
      this.sessions.set(ctx.from.id, {
        userId: user.id,
        telegramId,
        awaitingObjectionTopic: false,
        hasAnsweredCurrentObjection: false,
      });

      // Отправляем приветственное сообщение с изображением
      await ctx.replyWithPhoto(
        { source: "./src/assets/start.jpg" },
        {
          caption:
            "🔥 Добро пожаловать в ИИ-Гребенюка! 🔥\n\n" +
            "Хочешь расти, зарабатывать больше и не тупить? Жми СТАРТ.\n" +
            "Этот бот — твой персональный наставник. Он встряхнет тебя, даст четкие советы по бизнесу 💼, " +
            "прокачает твои навыки и не даст слиться.\n\n" +
            "⚡ Готов к разбору полетов? Жми СТАРТ! 🚀",
          parse_mode: "HTML",
          ...Markup.keyboard([
            ["🎯 Случайное возражение"],
            ["💰 Возражения по цене"],
            ["🤝 Возражения по доверию"],
            ["⏱ Возражения по срочности"],
            ["🛒 Возражения по потребности"],
            ["⚙️ Возражения по функциональности"],
            ["🤖 Сгенерировать возражения"],
          ]).resize(),
        },
      );
    } catch (error) {
      this.logger.error(`Ошибка при обработке команды /start: ${error.message}`);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.");
    }
  }

  /**
   * Обработчик выбора категории возражений
   */
  @Hears("💰 Возражения по цене")
  @Hears("🤝 Возражения по доверию")
  @Hears("⏱ Возражения по срочности")
  @Hears("🛒 Возражения по потребности")
  @Hears("⚙️ Возражения по функциональности")
  async onCategorySelect(ctx: Context) {
    if (!ctx.message || !("text" in ctx.message)) {
      return;
    }

    const text = ctx.message.text;
    const telegramId = ctx.from.id.toString();
    const session = this.getOrCreateSession(ctx);

    try {
      let categoryId: string | undefined;

      // Определяем выбранную категорию
      if (text.includes("цене")) {
        const category = await this.prisma.objectionCategory.findUnique({
          where: { name: "Цена" },
        });
        categoryId = category?.id;
      } else if (text.includes("доверию")) {
        const category = await this.prisma.objectionCategory.findUnique({
          where: { name: "Доверие" },
        });
        categoryId = category?.id;
      } else if (text.includes("срочности")) {
        const category = await this.prisma.objectionCategory.findUnique({
          where: { name: "Срочность" },
        });
        categoryId = category?.id;
      } else if (text.includes("потребности")) {
        const category = await this.prisma.objectionCategory.findUnique({
          where: { name: "Потребность" },
        });
        categoryId = category?.id;
      } else if (text.includes("функциональности")) {
        const category = await this.prisma.objectionCategory.findUnique({
          where: { name: "Функциональность" },
        });
        categoryId = category?.id;
      }

      // Получаем случайное возражение из выбранной категории или любое случайное
      const objection = await this.grebenukBotService.getRandomObjection(categoryId);

      // Обновляем сессию и сбрасываем состояние
      session.currentObjectionId = objection.id;
      session.currentObjectionText = objection.text;
      session.currentCategoryId = categoryId;
      session.hasAnsweredCurrentObjection = false; // Сбрасываем флаг ответа

      await ctx.reply(`🗣 <b>Возражение клиента:</b>\n"${objection.text}"\n\n` + `Ответьте на это возражение текстом или отправьте голосовое сообщение.`, {
        parse_mode: "HTML",
        ...Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize(),
      });
    } catch (error) {
      this.logger.error(`Ошибка при выборе категории: ${error.message}`);
      await ctx.reply(
        "❌ Произошла ошибка. Пожалуйста, попробуйте позже.",
        Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения"], ["🏠 Главное меню"]]).resize(),
      );
    }
  }

  /**
   * Обработчик кнопки "Случайное возражение"
   */
  @Hears("🎯 Случайное возражение")
  async onRandomObjection(ctx: Context) {
    const telegramId = ctx.from.id.toString();
    const session = this.getOrCreateSession(ctx);

    try {
      // Получаем случайное возражение
      const objection = await this.grebenukBotService.getRandomObjection();

      // Обновляем сессию и сбрасываем состояние
      session.currentObjectionId = objection.id;
      session.currentObjectionText = objection.text;
      session.currentCategoryId = objection.categoryId;
      session.hasAnsweredCurrentObjection = false; // Сбрасываем флаг ответа

      await ctx.reply(`🗣 <b>Возражение клиента:</b>\n"${objection.text}"\n\n` + `Ответьте на это возражение текстом или отправьте голосовое сообщение.`, {
        parse_mode: "HTML",
        ...Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize(),
      });
    } catch (error) {
      this.logger.error(`Ошибка при получении случайного возражения: ${error.message}`);
      await ctx.reply(
        "❌ Произошла ошибка. Пожалуйста, попробуйте позже.",
        Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения"], ["🏠 Главное меню"]]).resize(),
      );
    }
  }

  /**
   * Обработчик кнопки "Главное меню"
   */
  @Hears("🏠 Главное меню")
  async onMainMenu(ctx: Context) {
    try {
      await ctx.reply(
        "🚀 Тренажер для отработки возражений в продажах\n" +
          "Автор идеи: @besdenis | Разработчик: @holfizz\n\n" +
          "Выберите категорию возражений для тренировки или получите случайное возражение. Отвечайте текстом или голосовым сообщением, а я дам вам обратную связь в стиле Михаила Гребенюка 🎯",
        Markup.keyboard([
          ["🎯 Случайное возражение"],
          ["💰 Возражения по цене", "🤝 Возражения по доверию"],
          ["⏱ Возражения по срочности", "🛒 Возражения по потребности"],
          ["⚙️ Возражения по функциональности"],
          ["🤖 Сгенерировать возражения"],
        ]).resize(),
      );
    } catch (error) {
      this.logger.error(`Ошибка при отображении главного меню: ${error.message}`);
      await ctx.reply("❌ Произошла ошибка. Пожалуйста, попробуйте позже.", Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения"]]).resize());
    }
  }

  @Hears("🤖 Сгенерировать возражения")
  async onGenerateObjectionsMenu(@Ctx() ctx: Context) {
    try {
      await ctx.reply("Введите тему для генерации возражений или напишите 'любая' для случайной темы:");

      // Устанавливаем состояние ожидания темы для генерации возражений
      const session = this.getOrCreateSession(ctx);
      session.awaitingObjectionTopic = true;
      session.state = "awaiting_objection_topic";

      return;
    } catch (error) {
      this.logger.error(`Ошибка при запросе темы для генерации возражений: ${error.message}`);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.");
    }
  }

  /**
   * Обработчик сообщения с темой для генерации возражений
   */
  async onObjectionTopicMessage(ctx: Context, message: string): Promise<void> {
    try {
      const session = this.getOrCreateSession(ctx);
      session.awaitingObjectionTopic = false;
      session.state = "awaiting_response";

      // Если пользователь отправил "любая", то используем дефолтную тему
      const topic = message.toLowerCase() === "любая" ? "общая" : message;

      await ctx.reply(`🎯 Генерирую возражение для темы "${topic}"...`);

      // Генерируем возражение с помощью второго бота
      const result = await this.grebenukBotService.sendCozeRequest(topic);

      if (!result.success || !result.objection) {
        await ctx.reply(
          `❌ Не удалось сгенерировать возражение: ${result.error || "неизвестная ошибка"}`,
          Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения"], ["🏠 Главное меню"]]).resize(),
        );
        return;
      }

      // Сохраняем возражение в сессии как текущее
      session.currentObjectionText = result.objection;
      session.currentObjectionId = null;
      session.hasAnsweredCurrentObjection = false;

      // Отправляем возражение пользователю
      await ctx.reply(`🗣 <b>Возражение клиента:</b>\n"${result.objection}"\n\nОтветьте на это возражение текстом или отправьте голосовое сообщение.`, {
        parse_mode: "HTML",
        ...Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize(),
      });
    } catch (error) {
      this.logger.error(`Ошибка при обработке темы для возражений: ${error.message}`);
      await ctx.reply(
        "❌ Произошла ошибка. Пожалуйста, попробуйте позже.",
        Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения"], ["🏠 Главное меню"]]).resize(),
      );
    }
  }

  /**
   * Обработчик текстового ответа пользователя
   */
  async onTextResponse(ctx: Context) {
    if (!ctx.message || !("text" in ctx.message)) {
      return;
    }

    const text = ctx.message.text;
    const session = this.getOrCreateSession(ctx);

    // Проверяем, является ли сообщение командой или кнопкой меню
    if (
      text.startsWith("🎯") ||
      text.startsWith("💰") ||
      text.startsWith("🤝") ||
      text.startsWith("⏱") ||
      text.startsWith("🛒") ||
      text.startsWith("⚙️") ||
      text.startsWith("🤖") ||
      text.startsWith("🔄") ||
      text.startsWith("🏠")
    ) {
      return; // Пропускаем обработку кнопок меню
    }

    // Проверяем состояние сессии
    if (session.state === "awaiting_objection_topic") {
      await this.onObjectionTopicMessage(ctx, text);
      return;
    }

    // Если нет состояния или состояние awaiting_response, обрабатываем как ответ на возражение
    if (!session || !session.currentObjectionText) {
      await ctx.reply(
        "❌ Сначала выберите или сгенерируйте возражение, чтобы ответить на него.",
        Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize(),
      );
      return;
    }

    try {
      await ctx.reply("🤔 Анализирую ваш ответ...");
      const user = await this.prisma.user.findUnique({ where: { telegramId: ctx.from.id.toString() } });
      // Отправляем текст в Coze API с контекстом возражения и userId
      const cozeResponse = await this.grebenukBotService.processTextWithCoze(text, session.currentObjectionText, user.id);

      let replyMessage = `🗣 <b>Возражение:</b>\n${session.currentObjectionText}\n\n`;
      let grebenukResponse = cozeResponse;
      let errors = [];

      // Пытаемся распарсить JSON-ответ
      if (cozeResponse.trim().startsWith("{")) {
        try {
          const parsedResponse = JSON.parse(cozeResponse);
          if (parsedResponse.errors) {
            errors = parsedResponse.errors;
          }
          if (parsedResponse.grebenuk_response) {
            grebenukResponse = parsedResponse.grebenuk_response;
          }
        } catch (parseError) {
          // Если не удалось распарсить JSON, используем весь текст как ответ
          grebenukResponse = cozeResponse;
        }
      }

      // Добавляем типичные ошибки, если они есть
      if (errors.length > 0) {
        replyMessage += `⚠️ <b>Типичные ошибки:</b>\n`;
        errors.forEach((error, index) => {
          replyMessage += `${index + 1}. ${error}\n`;
        });
        replyMessage += "\n";
      }

      // Отправляем текстовое сообщение
      await ctx.reply(replyMessage, { parse_mode: "HTML" });

      // Отправляем голосовое сообщение с ответом Гребенюка
      if (grebenukResponse) {
        try {
          console.log(`Отправка текста на озвучку: "${grebenukResponse}"`);
          const audioBuffer = await this.grebenukBotService.synthesizeSpeech(grebenukResponse);

          if (audioBuffer && audioBuffer.length > 0) {
            console.log(`Отправляю синтезированное голосовое сообщение, размер: ${audioBuffer.length} байт`);
            await ctx.sendVoice(
              { source: audioBuffer },
              {
                caption: "👨‍🏫 Ответ Гребенюка:\n<blockquote expandable>" + grebenukResponse + "</blockquote>",
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Попробовать еще раз", "try_again")]]),
              },
            );
          } else {
            // Если аудио не сгенерировалось, отправляем текстовый ответ
            await ctx.reply("👨‍🏫 Ответ Гребенюка:\n" + grebenukResponse, {
              parse_mode: "HTML",
              ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Попробовать еще раз", "try_again")]]),
            });
          }
        } catch (ttsError) {
          console.error(`Ошибка при синтезе речи: ${ttsError.message}`);
          // В случае ошибки TTS отправляем текстовый ответ
          await ctx.reply("👨‍🏫 Ответ Гребенюка:\n" + grebenukResponse, {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Попробовать еще раз", "try_again")]]),
          });
        }
      }

      // Предлагаем пользователю выбрать следующее действие
      await ctx.reply("Выберите действие:", Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize());
    } catch (error) {
      this.logger.error(`Ошибка при анализе ответа: ${error.message}`);
      await ctx.reply(
        "❌ Произошла ошибка при анализе ответа. Пожалуйста, попробуйте еще раз.",
        Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize(),
      );
    }
  }

  /**
   * Обработчик голосового сообщения
   */
  @On("voice")
  async onVoice(@Ctx() ctx: any) {
    try {
      // Проверяем, содержит ли сообщение голосовую заметку
      if (!ctx.message.voice) {
        ctx.reply("Голосовое сообщение не найдено.");
        return;
      }

      // Получаем сессию пользователя
      const session = this.getOrCreateSession(ctx);

      // Проверяем, есть ли у пользователя текущее возражение
      if (!session.currentObjectionText) {
        await ctx.reply(
          "❌ Сначала выберите или сгенерируйте возражение, чтобы ответить на него.",
          Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize(),
        );
        return;
      }

      // Отправляем сообщение о том, что запрос обрабатывается
      const processingMessage = await ctx.reply("🎧 Обрабатываю ваше голосовое сообщение...");

      try {
        // Получаем file_id голосового сообщения
        const fileId = ctx.message.voice.file_id;
        console.log(`Получено голосовое сообщение, file_id: ${fileId}`);

        // Получаем ссылку на файл голосового сообщения
        const fileLink = await ctx.telegram.getFileLink(fileId);
        console.log(`Ссылка на голосовое сообщение: ${fileLink}`);

        // Скачиваем голосовое сообщение
        const response = await axios.get(fileLink, { responseType: "arraybuffer" });
        const audioBuffer = Buffer.from(response.data);
        const user = await this.prisma.user.findUnique({ where: { telegramId: ctx.from.id.toString() } });
        // Обрабатываем голосовое сообщение с контекстом возражения
        const result = await this.grebenukBotService.processVoiceMessage(audioBuffer, session.currentObjectionText, user.id);

        // Сохраняем транскрибированный текст в сессии
        session.lastVoiceText = result.transcribedText;

        // Проверяем, есть ли ошибка распознавания речи
        if (result.transcribedText.includes("Текст не распознан")) {
          await ctx.reply(`⚠️ ${result.transcribedText}`);
          return;
        }

        // Формируем сообщение с результатами
        let replyMessage = `🎤 <b>Вы сказали:</b>\n${result.transcribedText}\n\n`;
        replyMessage += `🗣 <b>Возражение:</b>\n${session.currentObjectionText}\n\n`;

        // Отправляем текстовое сообщение
        await ctx.reply(replyMessage, { parse_mode: "HTML" });

        // Проверяем, содержит ли ответ JSON-структуру
        if (result.processedText.trim().startsWith("{") && (result.processedText.includes("errors") || result.processedText.includes("grebenuk_response"))) {
          try {
            const parsedResponse = JSON.parse(result.processedText);
            const errors = parsedResponse.errors || [];
            const grebenukResponse = parsedResponse.grebenuk_response || "";

            // Добавляем типичные ошибки, если они есть
            if (errors.length > 0) {
              replyMessage = `⚠️ <b>Типичные ошибки:</b>\n`;
              errors.forEach((error, index) => {
                replyMessage += `${index + 1}. ${error}\n`;
              });
              replyMessage += "\n";
              await ctx.reply(replyMessage, { parse_mode: "HTML" });
            }

            // Отправляем голосовое сообщение с ответом Гребенюка
            if (grebenukResponse) {
              try {
                console.log(`Отправка текста на озвучку: "${grebenukResponse}"`);
                const audioBuffer = await this.grebenukBotService.synthesizeSpeech(grebenukResponse);

                if (audioBuffer && audioBuffer.length > 0) {
                  await ctx.sendVoice(
                    { source: audioBuffer },
                    {
                      caption: "👨‍🏫 Ответ Гребенюка:\n<blockquote expandable>" + grebenukResponse + "</blockquote>",
                      parse_mode: "HTML",
                      ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Попробовать еще раз", "try_again")]]),
                    },
                  );
                } else {
                  // Если аудио не сгенерировалось, отправляем текстовый ответ
                  await ctx.reply("👨‍🏫 Ответ Гребенюка:\n" + grebenukResponse, {
                    parse_mode: "HTML",
                    ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Попробовать еще раз", "try_again")]]),
                  });
                }
              } catch (ttsError) {
                console.error(`Ошибка при синтезе речи: ${ttsError.message}`);
                // В случае ошибки TTS отправляем текстовый ответ
                await ctx.reply("👨‍🏫 Ответ Гребенюка:\n" + grebenukResponse, {
                  parse_mode: "HTML",
                  ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Попробовать еще раз", "try_again")]]),
                });
              }
            }
          } catch (parseError) {
            this.logger.error(`Ошибка при парсинге JSON-ответа: ${parseError.message}`);
            // Если не удалось распарсить JSON, отправляем весь текст как есть
            await ctx.reply(result.processedText);
          }
        } else {
          // Если ответ не в формате JSON, отправляем его как есть
          await ctx.sendVoice(
            { source: result.audioBuffer },
            {
              caption: "👨‍🏫 Ответ Гребенюка:\n<blockquote expandable>" + result.processedText + "</blockquote>",
              parse_mode: "HTML",
              ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Попробовать еще раз", "try_again")]]),
            },
          );
        }
      } finally {
        // Удаляем сообщение о том, что запрос обрабатывается
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
        } catch (deleteError) {
          console.error(`Не удалось удалить сообщение: ${deleteError.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Ошибка при обработке голосового сообщения: ${error.message}`);
      await ctx.reply("❌ Произошла ошибка при обработке голосового сообщения. Пожалуйста, попробуйте еще раз.");
    }
  }

  /**
   * Обработчик кнопки "Попробовать еще раз"
   */
  @Action("try_again")
  async onTryAgain(@Ctx() ctx: TelegrafContext) {
    try {
      const session = this.getOrCreateSession(ctx);

      if (!session.currentObjectionText) {
        await ctx.answerCbQuery("❌ Сначала выберите возражение");
        return;
      }

      // Получаем последнюю историю диалога
      const lastHistory = await this.prisma.chatHistory.findFirst({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        select: {
          objectionText: true,
          userResponse: true,
          botResponse: true,
        },
      });

      if (lastHistory) {
        // Обновляем текущее возражение из истории
        session.currentObjectionText = lastHistory.objectionText;
      }

      // Сбрасываем флаг ответа
      session.hasAnsweredCurrentObjection = false;

      // Отправляем текущее возражение заново с контекстом последнего диалога
      await ctx.reply(
        `🗣 <b>Возражение клиента:</b>\n"${session.currentObjectionText}"\n\n` +
          (lastHistory ? `📝 <b>Ваш последний ответ был:</b>\n"${lastHistory.userResponse}"\n\n` + `👨‍🏫 <b>Михаил ответил:</b>\n"${lastHistory.botResponse}"\n\n` : "") +
          `Попробуйте ответить на это возражение ещё раз текстом или отправьте голосовое сообщение.`,
        {
          parse_mode: "HTML",
          ...Markup.keyboard([["🎯 Случайное возражение"], ["🤖 Сгенерировать возражения", "🏠 Главное меню"]]).resize(),
        },
      );

      // Удаляем инлайн клавиатуру из предыдущего сообщения
      if ("callback_query" in ctx.update && ctx.update.callback_query.message) {
        try {
          await ctx.telegram.editMessageReplyMarkup(ctx.update.callback_query.message.chat.id, ctx.update.callback_query.message.message_id, undefined, { inline_keyboard: [] });
        } catch (error) {
          this.logger.error("Не удалось удалить инлайн клавиатуру:", error.message);
        }
      }

      await ctx.answerCbQuery("✅ Отвечайте на возражение!");
    } catch (error) {
      this.logger.error(`Ошибка при повторной попытке: ${error.message}`);
      await ctx.answerCbQuery("❌ Произошла ошибка");
    }
  }

  private getOrCreateSession(ctx: Context): SessionData {
    const session = this.sessions.get(ctx.from.id);
    if (session) {
      return session;
    } else {
      const newSession: SessionData = {
        userId: "",
        telegramId: "",
        awaitingObjectionTopic: false,
        hasAnsweredCurrentObjection: false,
      };
      this.sessions.set(ctx.from.id, newSession);
      return newSession;
    }
  }
}
