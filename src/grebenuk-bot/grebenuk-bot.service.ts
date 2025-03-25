import { PrismaService } from "@/prisma.service";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Objection, ObjectionCategory, UserResponse } from "@prisma/client";
import axios from "axios";
import { exec } from "child_process";
import * as ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { firstValueFrom } from "rxjs";
import { promisify } from "util";

const execPromise = promisify(exec);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

@Injectable()
export class GrebenukBotService {
  private readonly logger = new Logger(GrebenukBotService.name);

  // Константы для API ключей
  private readonly OPENAI_API_KEY: string;
  private readonly DEEPGRAM_API_KEY: string;
  private readonly COZE_API_KEY: string;
  private readonly COZE_BOT_ID: string;
  private readonly ttsApiKey: string;
  private readonly ttsBaseUrl = "https://tts-backend.voice.ai";

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.OPENAI_API_KEY = this.configService.get<string>("OPENAI_API_KEY");
    this.DEEPGRAM_API_KEY = this.configService.get<string>("DEEPGRAM_API_KEY");
    this.COZE_API_KEY = this.configService.get<string>("COZE_API_KEY");
    this.COZE_BOT_ID = this.configService.get<string>("COZE_BOT_ID");
    this.ttsApiKey = this.configService.get<string>("AI_VOICE_API_KEY");

    // Логируем информацию о ключах для отладки
    this.logger.log(`OpenAI API Key: ${this.OPENAI_API_KEY ? "Установлен" : "Не установлен"}`);
    this.logger.log(`Deepgram API Key: ${this.DEEPGRAM_API_KEY ? "Установлен" : "Не установлен"}`);
    this.logger.log(`Coze API Key: ${this.COZE_API_KEY ? "Установлен" : "Не установлен"}`);
    this.logger.log(`Coze Bot ID: ${this.COZE_BOT_ID ? "Установлен" : "Не установлен"}`);
    this.logger.log(`TTS API Key: ${this.ttsApiKey ? "Установлен" : "Не установлен"}`);
  }

  /**
   * Получить возражение по ID
   */
  async getObjectionById(id: string): Promise<Objection> {
    const objection = await this.prisma.objection.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!objection) {
      throw new Error(`Возражение с ID ${id} не найдено`);
    }

    return objection;
  }

  /**
   * Получить случайное возражение
   */
  async getRandomObjection(categoryId?: string): Promise<Objection> {
    const whereClause = categoryId ? { categoryId } : {};

    const objections = await this.prisma.objection.findMany({
      where: whereClause,
      include: {
        category: true,
      },
    });

    if (objections.length === 0) {
      throw new Error("Возражения не найдены");
    }

    const randomIndex = Math.floor(Math.random() * objections.length);
    return objections[randomIndex];
  }

  /**
   * Получить все категории возражений
   */
  async getObjectionCategories(): Promise<ObjectionCategory[]> {
    return this.prisma.objectionCategory.findMany();
  }

  /**
   * Получить резервную транскрипцию для тестирования
   * Используется в случае недоступности API для распознавания речи
   */
  private getFallbackTranscription(errorMessage: string): string {
    // В режиме разработки можем использовать демо-текст
    if (this.configService.get<string>("NODE_ENV") === "development") {
      return "Тестовое демо-сообщение для разработки. API распознавания речи недоступно.";
    }

    return `Извините, я не смог распознать речь: ${errorMessage}`;
  }

  /**
   * Распознать речь в текст с использованием Deepgram API
   */
  async transcribeSpeech(audioBuffer: Buffer): Promise<string> {
    let tempFilePath: string | null = null;
    let wavFilePath: string | null = null;

    try {
      // Проверка входных данных
      if (!audioBuffer || audioBuffer.length === 0) {
        return this.getFallbackTranscription("Пустой аудио буфер");
      }

      // Проверка наличия ключа API
      if (!this.DEEPGRAM_API_KEY) {
        return this.getFallbackTranscription("API ключ не настроен");
      }

      // Создаем временный файл для аудио
      tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.ogg`);
      fs.writeFileSync(tempFilePath, audioBuffer);

      // Проверяем, что файл создан
      if (!fs.existsSync(tempFilePath)) {
        return this.getFallbackTranscription("Ошибка создания временного файла");
      }

      // Конвертируем аудио в WAV для лучшей совместимости
      wavFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.wav`);

      // Конвертируем аудио в WAV (монофонический, 16кГц, 16бит)
      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempFilePath)
          .outputOptions("-ac", "1") // Монофонический звук
          .outputOptions("-ar", "16000") // Частота дискретизации 16 кГц
          .outputOptions("-acodec", "pcm_s16le") // 16-бит PCM
          .output(wavFilePath)
          .on("error", err => {
            reject(err);
          })
          .on("end", () => {
            resolve();
          })
          .run();
      });

      // Убеждаемся, что файл был создан
      if (!fs.existsSync(wavFilePath)) {
        throw new Error("Файл WAV не был создан при конвертации");
      }

      const fileStats = fs.statSync(wavFilePath);
      if (fileStats.size === 0) {
        return this.getFallbackTranscription("Пустой WAV файл после конвертации");
      }

      // Отправляем аудио в Deepgram API
      const audioData = fs.readFileSync(wavFilePath);
      const response = await this.transcribeWithDeepgram(audioData);

      return response;
    } catch (error) {
      console.log(`[Транскрипция] Ошибка: ${error.message}`);
      // Возвращаем информативное сообщение об ошибке
      return `Ошибка распознавания речи: ${error.message}`;
    } finally {
      // Удаляем временные файлы
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        if (wavFilePath && fs.existsSync(wavFilePath)) {
          fs.unlinkSync(wavFilePath);
        }
      } catch (err) {
        // Игнорируем ошибки при удалении временных файлов
      }
    }
  }

  /**
   * Отправить аудио в Deepgram API для распознавания речи
   */
  private async transcribeWithDeepgram(audioBuffer: Buffer): Promise<string> {
    try {
      if (!this.DEEPGRAM_API_KEY) {
        return this.getFallbackTranscription("API ключ не настроен");
      }

      // Изменяем уровень сервиса с enhanced на base, так как для русского языка поддерживается только base tier
      const response = await axios.post("https://api.deepgram.com/v1/listen?model=base&language=ru&punctuate=true&diarize=false", audioBuffer, {
        headers: {
          Authorization: `Token ${this.DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/wav",
        },
      });

      if (!response.data || !response.data.results) {
        return this.getFallbackTranscription("Некорректный ответ от API");
      }

      // Извлекаем распознанный текст
      const transcription = response.data.results?.channels[0]?.alternatives[0]?.transcript || "";

      if (!transcription) {
        return "Текст не распознан. Пожалуйста, говорите чётче или попробуйте снова в более тихом месте.";
      }

      return transcription;
    } catch (apiError) {
      console.log(`[Deepgram] Ошибка: ${apiError.message}`);

      if (apiError.response) {
        console.log(`[Deepgram] Статус: ${apiError.response.status}`);
      }

      return this.getFallbackTranscription(apiError.message);
    }
  }

  /**
   * Анализировать ответ пользователя с помощью GPT-4
   */
  async analyzeResponse(
    objection: string,
    userResponse: string,
  ): Promise<{
    score: number;
    feedback: string;
    hasRecognition: boolean;
    hasArgument: boolean;
    hasReversal: boolean;
    hasCallToAction: boolean;
    idealResponse: string;
  }> {
    try {
      const prompt = `
      Ты - Михаил Гребенюк, известный бизнес-тренер и эксперт по продажам.
      
      Проанализируй ответ на возражение клиента и оцени его по шкале от 1 до 10.
      
      Возражение клиента: "${objection}"
      
      Ответ продавца: "${userResponse}"
      
      Оцени ответ по следующим критериям:
      1. Признание возражения (да/нет)
      2. Аргументация (да/нет)
      3. Переворот возражения (да/нет)
      4. Призыв к действию (да/нет)
      
      Дай общую оценку от 1 до 10.
      
      Напиши идеальный ответ на это возражение в твоем стиле.
      
      Дай обратную связь в своем фирменном стиле - если ответ плохой, иронично давишь и шутишь, если хороший - хвалишь, но предлагаешь улучшение.
      
      Ответ должен быть в формате JSON:
      {
        "score": число от 1 до 10,
        "hasRecognition": true/false,
        "hasArgument": true/false,
        "hasReversal": true/false,
        "hasCallToAction": true/false,
        "idealResponse": "текст идеального ответа",
        "feedback": "твоя обратная связь в твоем стиле"
      }
      `;

      const response = await firstValueFrom(
        this.httpService.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: "Ты - Михаил Гребенюк, известный бизнес-тренер и эксперт по продажам. Твой стиль общения прямой, иногда ироничный, но всегда нацеленный на результат.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
          },
          {
            headers: {
              Authorization: `Bearer ${this.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          },
        ),
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      return {
        score: result.score,
        feedback: result.feedback,
        hasRecognition: result.hasRecognition,
        hasArgument: result.hasArgument,
        hasReversal: result.hasReversal,
        hasCallToAction: result.hasCallToAction,
        idealResponse: result.idealResponse,
      };
    } catch (error) {
      this.logger.error(`Ошибка при анализе ответа: ${error.message}`);
      throw new Error("Не удалось проанализировать ответ");
    }
  }

  /**
   * Синтезировать речь с помощью API голосовой генерации
   */
  async synthesizeSpeech(text: string): Promise<Buffer> {
    try {
      // Получаем ID голоса из переменных окружения
      const voiceId = this.configService.get<string>("VOICE_ID");
      const apiKey = this.configService.get<string>("VOICE_AI_API_KEY");

      if (!voiceId || !apiKey) {
        throw new Error("VOICE_ID или VOICE_AI_API_KEY не заданы в переменных окружения");
      }

      this.logger.log(`[TTS] Использую голос с ID: ${voiceId}`);

      // Создаем запрос на синтез речи
      const ttsResponse = await axios.post(
        `${this.ttsBaseUrl}/dev/api/v1/audios/text-to-speech`,
        {
          voice: voiceId,
          text,
          creativity: 20,
          diversity: 0,
          precision: 100,
          adherence: 90,
          guidance: 85,
        },
        {
          headers: {
            "X-API-Token": apiKey,
          },
        },
      );

      this.logger.log(`[TTS] Ответ от API: ${JSON.stringify(ttsResponse.data)}`);

      // Получаем ID созданного аудио
      const { audioId } = ttsResponse.data;

      if (!audioId) {
        throw new Error("Не получен ID аудио от TTS API");
      }

      this.logger.log(`[TTS] Получен audioId: ${audioId}`);

      // Ждем, пока аудио будет готово
      let audioStatus = "PROCESSING";
      let attempts = 0;
      const maxAttempts = 30; // Максимальное количество попыток (30 секунд)

      while (audioStatus !== "AVAILABLE" && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusResponse = await axios.get(`${this.ttsBaseUrl}/dev/api/v1/audios/${audioId}`, {
          headers: {
            "X-API-Token": apiKey,
          },
        });
        audioStatus = statusResponse.data.status;
        this.logger.log(`[TTS] Статус аудио (попытка ${attempts + 1}/${maxAttempts}): ${audioStatus}`);
        attempts++;
      }

      if (audioStatus !== "AVAILABLE") {
        throw new Error("Превышено время ожидания генерации аудио");
      }

      // Скачиваем готовое аудио
      const downloadResponse = await axios.get(`${this.ttsBaseUrl}/dev/api/v1/audios/${audioId}/download`, {
        headers: {
          "X-API-Token": apiKey,
        },
      });

      this.logger.log(`[TTS] Ссылка на аудио получена: ${downloadResponse.data.audioFileUrl}`);

      // Получаем аудио-файл по URL
      const audioResponse = await axios.get(downloadResponse.data.audioFileUrl, {
        responseType: "arraybuffer",
      });
      console.log(111, audioResponse);
      this.logger.log(`[TTS] Аудиофайл успешно загружен, размер: ${audioResponse.data.byteLength} байт`);

      return Buffer.from(audioResponse.data);
    } catch (error) {
      this.logger.error(`[TTS] Ошибка при синтезе речи: ${error}`);
      throw error;
    }
  }

  /**
   * Сохранить ответ пользователя
   */
  async saveUserResponse(
    userId: string,
    objectionId: string,
    responseText: string,
    audioUrl: string | null,
    analysisResult: {
      score: number;
      feedback: string;
      hasRecognition: boolean;
      hasArgument: boolean;
      hasReversal: boolean;
      hasCallToAction: boolean;
      idealResponse: string;
    },
  ): Promise<UserResponse> {
    return this.prisma.userResponse.create({
      data: {
        userId,
        objectionId,
        responseText,
        audioUrl,
        score: analysisResult.score,
        feedback: analysisResult.feedback,
        hasRecognition: analysisResult.hasRecognition,
        hasArgument: analysisResult.hasArgument,
        hasReversal: analysisResult.hasReversal,
        hasCallToAction: analysisResult.hasCallToAction,
        idealResponse: analysisResult.idealResponse,
      },
    });
  }

  async seedInitialData() {
    try {
      console.log("Начальные данные теперь загружаются через prisma/seed.ts");
      console.log("Пожалуйста, используйте команду: npm run prisma:seed");
      return { success: true, message: "Используйте npm run prisma:seed для загрузки данных" };
    } catch (error) {
      console.error("Ошибка:", error);
      throw error;
    }
  }

  /**
   * Использовать универсальный промпт для анализа ответа, генерации возражений или анализа запроса
   */
  async useUniversalPrompt(data: any): Promise<any> {
    try {
      let prompt = "";

      // Определяем режим работы на основе входных данных
      if (data.objection && data.userResponse) {
        // Режим 1: Анализ ответа на возражение
        prompt = `
        Ты - Михаил Гребенюк, известный бизнес-тренер и эксперт по продажам с жестким, прямолинейным стилем общения. Твой стиль прямой, иногда ироничный, но всегда нацеленный на результат.

        Проанализируй ответ на возражение клиента и оцени его по шкале от 1 до 10.

        Возражение клиента: "${data.objection}"
        Ответ продавца: "${data.userResponse}"
        ${data.category ? `Категория возражения: ${data.category}` : ""}

        Оцени ответ по следующим критериям:
        1. Признание возражения (да/нет)
        2. Аргументация (да/нет)
        3. Переворот возражения (да/нет)
        4. Призыв к действию (да/нет)

        ${
          data.category === "Цена"
            ? `
        При анализе ответа на возражение по цене, обрати особое внимание на:
        1. Признание ценности продукта/услуги
        2. Объяснение, почему цена соответствует ценности
        3. Сравнение с конкурентами (если уместно)
        4. Предложение вариантов оплаты или скидок (если уместно)
        `
            : ""
        }

        ${
          data.category === "Доверие"
            ? `
        При анализе ответа на возражение по доверию, обрати особое внимание на:
        1. Использование социальных доказательств (отзывы, кейсы, примеры)
        2. Демонстрацию экспертности и опыта
        3. Предоставление гарантий
        4. Прозрачность и честность в коммуникации
        `
            : ""
        }

        ${
          data.category === "Срочность"
            ? `
        При анализе ответа на возражение по срочности, обрати особое внимание на:
        1. Создание ощущения дефицита (ограниченное предложение, время)
        2. Объяснение рисков откладывания решения
        3. Предложение пробного/тестового периода
        4. Демонстрация быстрых результатов
        `
            : ""
        }

        Дай общую оценку от 1 до 10.

        Напиши идеальный ответ на это возражение в твоем стиле.

        Дай обратную связь в своем фирменном стиле - если ответ плохой, иронично давишь и шутишь, если хороший - хвалишь, но предлагаешь улучшение.

        Ответ должен быть в формате JSON:
        {
          "score": число от 1 до 10,
          "hasRecognition": true/false,
          "hasArgument": true/false,
          "hasReversal": true/false,
          "hasCallToAction": true/false,
          "idealResponse": "текст идеального ответа",
          "feedback": "твоя обратная связь в твоем стиле",
          "errors": ["список ошибок в ответе"]
        }
        `;
      } else if (data.topic) {
        // Режим 2: Генерация возражений
        this.logger.log(`Генерация возражений на тему: ${data.topic}`);
        prompt = `
        Ты - Михаил Гребенюк, известный бизнес-тренер и эксперт по продажам с жестким, прямолинейным стилем общения.

        Сгенерируй 5 реалистичных возражений клиентов на тему: "${data.topic}".

        Возражения должны быть:
        - Разнообразными (разные категории: цена, доверие, срочность)
        - Реалистичными (такими, с которыми продавцы действительно сталкиваются)
        - Разной сложности (от 1 до 5, где 5 - самые сложные)

        Ответ должен быть в формате JSON:
        {
          "objections": [
            {
              "text": "текст возражения 1",
              "category": "Цена/Доверие/Срочность",
              "difficulty": число от 1 до 5
            },
            {
              "text": "текст возражения 2",
              "category": "Цена/Доверие/Срочность",
              "difficulty": число от 1 до 5
            },
            ...
          ]
        }
        `;
      } else if (data.userRequest) {
        // Режим 3: Анализ ошибок в запросе
        prompt = `
        Ты - Михаил Гребенюк, известный бизнес-тренер и эксперт по продажам с жестким, прямолинейным стилем общения.

        Проанализируй запрос пользователя и найди в нем ошибки или недостатки:

        Запрос пользователя: "${data.userRequest}"

        Ответ должен быть в формате JSON:
        {
          "isValid": true/false,
          "errors": ["список ошибок в запросе"],
          "suggestions": ["список предложений по улучшению запроса"],
          "grebenukResponse": "как бы ты ответил на этот запрос в своем фирменном стиле"
        }
        `;
      } else {
        throw new Error("Неверный формат данных для промпта");
      }

      this.logger.log(`Отправка запроса к OpenAI API с промптом длиной ${prompt.length} символов`);

      try {
        const response = await firstValueFrom(
          this.httpService.post(
            "https://api.openai.com/v1/chat/completions",
            {
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: "Ты - Михаил Гребенюк, известный бизнес-тренер и эксперт по продажам. Твой стиль общения прямой, иногда ироничный, но всегда нацеленный на результат.",
                },
                { role: "user", content: prompt },
              ],
              temperature: 0.7,
            },
            {
              headers: {
                Authorization: `Bearer ${this.OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
            },
          ),
        );

        this.logger.log(`Получен ответ от OpenAI API`);

        const content = response.data.choices[0].message.content;
        this.logger.log(`Длина содержимого ответа: ${content.length} символов`);

        try {
          const parsedResponse = JSON.parse(content);
          this.logger.log(`JSON успешно распарсен`);
          return parsedResponse;
        } catch (parseError) {
          this.logger.error(`Ошибка при парсинге JSON: ${parseError.message}`);
          this.logger.error(`Полученный контент: ${content}`);
          return {
            error: "Не удалось распарсить ответ от OpenAI",
            rawResponse: content,
          };
        }
      } catch (apiError) {
        this.logger.error(`Ошибка при запросе к OpenAI API: ${apiError.message}`);
        if (apiError.response) {
          this.logger.error(`Статус ошибки: ${apiError.response.status}`);
          this.logger.error(`Данные ошибки: ${JSON.stringify(apiError.response.data)}`);
        }
        throw new Error(`Ошибка при запросе к OpenAI API: ${apiError.message}`);
      }
    } catch (error) {
      this.logger.error(`Ошибка при использовании универсального промпта: ${error.message}`);
      throw new Error("Не удалось обработать запрос");
    }
  }

  async processTextWithCoze(text: string, objectionContext?: string, userId?: string): Promise<string> {
    try {
      console.log(`[Coze] Запрос: "${text}"`);

      // Получаем последнюю историю диалога
      let chatHistory = [];
      if (userId) {
        const lastHistory = await this.prisma.chatHistory.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: {
            objectionText: true,
            userResponse: true,
            botResponse: true,
          },
        });

        if (lastHistory) {
          chatHistory = [
            { role: "user", content_type: "text", content: `Возражение клиента: "${lastHistory.objectionText}"` },
            { role: "user", content_type: "text", content: lastHistory.userResponse },
            { role: "assistant", content_type: "text", content: lastHistory.botResponse, type: "answer" },
          ];
        }
      }

      const query = objectionContext ? `Возражение клиента: "${objectionContext}"\nОтвет продавца: "${text}"` : `Запрос пользователя: "${text}"`;

      const response = await axios.post(
        "https://api.coze.com/open_api/v2/chat",
        {
          bot_id: this.COZE_BOT_ID,
          user: userId,
          query: query,
          stream: false,
          chat_history: chatHistory || [],
        },
        {
          headers: {
            Authorization: `Bearer ${this.COZE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "*/*",
            Connection: "keep-alive",
          },
        },
      );

      // Проверяем наличие данных и сообщений в ответе
      if (!response.data || !response.data.messages) {
        console.log(`[Coze] Ошибка: неправильный формат ответа`, response.data);
        throw new Error("Некорректный ответ от Coze API");
      }

      // Находим основной ответ типа 'answer' в массиве сообщений
      const answerMessage = response.data.messages.find(msg => msg.role === "assistant" && msg.type === "answer");

      if (!answerMessage || !answerMessage.content) {
        console.log(`[Coze] Ошибка: не найден ответ типа answer`, response.data);
        throw new Error("Не найден ответ в сообщениях Coze API");
      }

      let finalResponse = answerMessage.content;
      let errors = [];

      // Пытаемся распарсить JSON-ответ
      try {
        const parsedContent = JSON.parse(answerMessage.content);
        if (parsedContent.grebenuk_response) {
          finalResponse = parsedContent.grebenuk_response;
        } else if (parsedContent.response) {
          finalResponse = parsedContent.response;
        }
        if (parsedContent.errors) {
          errors = parsedContent.errors;
        }
      } catch (parseError) {
        // Если не удалось распарсить как JSON, используем текст как есть
        finalResponse = answerMessage.content;
      }
      console.log("userId", userId);
      console.log("objectionContext", objectionContext);
      // Сохраняем диалог в историю, если есть userId и контекст возражения
      if (userId && objectionContext) {
        await this.prisma.chatHistory.create({
          data: {
            userId,
            objectionText: objectionContext,
            userResponse: text,
            botResponse: finalResponse,
          },
        });
        console.log(`[Coze] История диалога сохранена:
          Возражение: ${objectionContext}
          Ответ пользователя: ${text}
          Ответ бота: ${finalResponse}
          ${errors.length > 0 ? `Ошибки: ${errors.join(", ")}` : ""}`);
      }

      return finalResponse;
    } catch (error) {
      console.log(`[Coze] Ошибка: ${error.message}`);
      if (error.response) {
        console.log(`[Coze] Статус: ${error.response.status}`, error.response.data);
      }
      throw new Error(`Не удалось обработать текст через Coze API: ${error.message}`);
    }
  }

  /**
   * Обработать голосовое сообщение: транскрибировать, обработать через Coze и синтезировать речь
   */
  async processVoiceMessage(
    audioBuffer: Buffer,
    objectionContext?: string,
    userId?: string,
  ): Promise<{
    transcribedText: string;
    processedText: string;
    audioBuffer: Buffer;
    objection?: Objection;
  }> {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error("Получен пустой аудио буфер");
      }

      // Транскрибируем голосовое сообщение через Deepgram
      const transcribedText = await this.transcribeSpeech(audioBuffer);
      console.log(`[Транскрипция] Результат: "${transcribedText}"`);

      // Проверяем, содержит ли результат сообщение об ошибке распознавания
      if (transcribedText.includes("Текст не распознан")) {
        console.log(`[Транскрипция] Ошибка распознавания текста: "${transcribedText}"`);
        return {
          transcribedText,
          processedText: transcribedText,
          audioBuffer: Buffer.from([]),
        };
      }

      // Отправляем транскрибированный текст в Coze API только если нет ошибки распознавания
      let processedText = transcribedText;

      if (transcribedText && transcribedText.length > 0 && !transcribedText.startsWith("Ошибка")) {
        try {
          // Отправляем текст в Coze API с контекстом возражения
          const cozeResponse = await this.processTextWithCoze(transcribedText, objectionContext, userId);

          if (cozeResponse) {
            processedText = cozeResponse;
          }
        } catch (cozeError) {
          console.log(`[Coze] Ошибка обработки: ${cozeError.message}`);
          processedText = `Не удалось обработать текст через Coze API: ${cozeError.message}`;
        }
      }

      // Синтезируем речь из обработанного текста
      let synthesizedAudio: Buffer;
      try {
        console.log(`[TTS] Отправка текста на озвучку: "${processedText}"`);
        synthesizedAudio = await this.synthesizeSpeech(processedText);
        console.log(`[TTS] Аудио успешно синтезировано, размер: ${synthesizedAudio.length} байт`);
      } catch (ttsError) {
        console.log(`[TTS] Ошибка синтеза речи: ${ttsError.message}`);
        // В случае ошибки возвращаем пустой буфер
        synthesizedAudio = Buffer.from([]);
      }

      // Получаем случайное возражение для следующего раунда
      const objection = await this.getRandomObjection();

      return {
        transcribedText,
        processedText,
        audioBuffer: synthesizedAudio,
        objection,
      };
    } catch (error) {
      console.log(`[Ошибка] ${error.message}`);

      // Создаем информативный ответ с сообщением об ошибке
      const errorMessage = `Ошибка при обработке голосового сообщения: ${error.message}`;

      return {
        transcribedText: errorMessage,
        processedText: errorMessage,
        audioBuffer: Buffer.from([]),
      };
    }
  }

  /**
   * Отправить запрос к боту Coze с универсальным промптом
   */
  async sendCozeRequest(topic: string) {
    try {
      this.logger.log(`Отправка запроса к Coze API для темы: "${topic}"`);

      const prompt = `Ты - Михаил Гребенюк, известный бизнес-тренер и эксперт по продажам.
      Сгенерируй одно реалистичное возражение клиента на тему "${topic}".
      
      Возражение должно быть:
      1. Реалистичным (с которым продавцы действительно сталкиваются)
      2. Конкретным (не общим)
      3. Сложным (чтобы было интересно на него отвечать)
      
      Верни ответ в формате:
      {
        "objection": "текст сгенерированного возражения"
      }`;

      const response = await axios.post(
        "https://api.coze.com/open_api/v2/chat",
        {
          bot_id: this.COZE_BOT_ID, // Используем бота для генерации возражений
          user: "telegramUser",
          query: prompt,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${this.COZE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "*/*",
            Connection: "keep-alive",
          },
        },
      );

      // Проверяем наличие ответа
      if (!response.data || !response.data.messages) {
        throw new Error("Некорректный ответ от Coze API");
      }

      // Находим сообщение с ответом
      const message = response.data.messages.find(msg => msg.role === "assistant" && msg.type === "answer");
      if (!message || !message.content) {
        throw new Error("Ответ не найден в сообщениях Coze API");
      }

      try {
        // Пытаемся найти JSON в ответе
        const jsonMatch = message.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedResponse = JSON.parse(jsonMatch[0]);
          if (!parsedResponse.objection) {
            throw new Error("В ответе отсутствует поле objection");
          }
          return {
            success: true,
            objection: parsedResponse.objection,
          };
        } else {
          // Если JSON не найден, используем весь текст как возражение
          return {
            success: true,
            objection: message.content.trim(),
          };
        }
      } catch (parseError) {
        this.logger.error(`Ошибка при парсинге JSON: ${parseError.message}`);
        // Если не удалось распарсить JSON, используем весь текст как возражение
        return {
          success: true,
          objection: message.content.trim(),
        };
      }
    } catch (error) {
      this.logger.error(`Ошибка при отправке запроса к Coze API: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getMyVoices() {
    try {
      const response = await axios.get(`${this.ttsBaseUrl}/dev/api/v1/voices/my`, {
        headers: {
          "X-API-Token": this.ttsApiKey,
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Ошибка при получении списка голосов: ${error.message}`);
      throw error;
    }
  }

  private async convertToWav(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace(/\.[^/.]+$/, ".wav");

    this.logger.log(`Начинаю конвертацию аудио из ${inputPath} в ${outputPath}`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat("wav")
        .outputOptions("-acodec", "pcm_s16le")
        .outputOptions("-ar", "16000")
        .outputOptions("-ac", "1")
        .on("start", commandLine => {
          this.logger.log(`Запущена команда ffmpeg: ${commandLine}`);
        })
        .on("progress", progress => {
          this.logger.log(`Прогресс конвертации: ${JSON.stringify(progress)}`);
        })
        .on("end", () => {
          this.logger.log(`Конвертация успешно завершена: ${outputPath}`);

          // Проверяем результат
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            this.logger.log(`Размер сконвертированного файла: ${stats.size} байт`);
            resolve(outputPath);
          } else {
            reject(new Error("Файл не был создан после конвертации"));
          }
        })
        .on("error", err => {
          this.logger.error(`Ошибка при конвертации аудио: ${err.message}`);
          reject(err);
        })
        .save(outputPath);
    });
  }
}
