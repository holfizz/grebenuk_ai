import { BadRequestException, Body, Controller, Get, Logger, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import axios from "axios";
import { GrebenukBotService } from "./grebenuk-bot.service";

@ApiTags("grebenuk-bot")
@Controller("grebenuk-bot")
export class GrebenukBotController {
  private readonly logger = new Logger(GrebenukBotController.name);

  constructor(
    private readonly grebenukBotService: GrebenukBotService,
    private readonly configService: ConfigService,
  ) {}

  @Get("categories")
  @ApiOperation({ summary: "Получить все категории возражений" })
  @ApiResponse({ status: 200, description: "Список категорий возражений" })
  async getObjectionCategories() {
    try {
      return await this.grebenukBotService.getObjectionCategories();
    } catch (error) {
      this.logger.error(`Ошибка при получении категорий: ${error.message}`);
      throw error;
    }
  }

  @Get("objection/random")
  @ApiOperation({ summary: "Получить случайное возражение" })
  @ApiResponse({ status: 200, description: "Случайное возражение" })
  async getRandomObjection() {
    try {
      return await this.grebenukBotService.getRandomObjection();
    } catch (error) {
      this.logger.error(`Ошибка при получении случайного возражения: ${error.message}`);
      throw error;
    }
  }

  @Get("objection/random/:categoryId")
  @ApiOperation({ summary: "Получить случайное возражение из категории" })
  @ApiResponse({ status: 200, description: "Случайное возражение из категории" })
  async getRandomObjectionByCategory(@Param("categoryId") categoryId: string) {
    try {
      return await this.grebenukBotService.getRandomObjection(categoryId);
    } catch (error) {
      this.logger.error(`Ошибка при получении случайного возражения из категории: ${error.message}`);
      throw error;
    }
  }

  @Post("analyze")
  @ApiOperation({ summary: "Анализировать текстовый ответ пользователя" })
  @ApiResponse({ status: 200, description: "Результат анализа ответа" })
  async analyzeTextResponse(@Body() body: { userId: string; objectionId: string; response: string }) {
    try {
      const { userId, objectionId, response } = body;

      // Получаем возражение
      const objection = await this.grebenukBotService.getObjectionById(objectionId);

      // Анализируем ответ
      const analysisResult = await this.grebenukBotService.analyzeResponse(objection.text, response);

      // Сохраняем ответ пользователя
      await this.grebenukBotService.saveUserResponse(userId, objectionId, response, null, analysisResult);

      // Синтезируем речь для обратной связи
      const audioBuffer = await this.grebenukBotService.synthesizeSpeech(analysisResult.feedback);

      return {
        ...analysisResult,
        audioBase64: audioBuffer.toString("base64"),
      };
    } catch (error) {
      this.logger.error(`Ошибка при анализе текстового ответа: ${error.message}`);
      throw error;
    }
  }

  @Post("analyze/audio")
  @UseInterceptors(FileInterceptor("audio"))
  @ApiOperation({ summary: "Анализировать голосовой ответ пользователя" })
  @ApiResponse({ status: 200, description: "Результат анализа голосового ответа" })
  async analyzeAudioResponse(@UploadedFile() file: any, @Body() body: { userId: string; objectionId: string }) {
    try {
      const { userId, objectionId } = body;

      // Получаем возражение
      const objection = await this.grebenukBotService.getObjectionById(objectionId);

      // Распознаем речь
      const transcribedText = await this.grebenukBotService.transcribeSpeech(file.buffer);
      this.logger.log(`Результат транскрибации: "${transcribedText}"`);

      // Проверяем, есть ли в тексте сообщение об ошибке
      if (transcribedText.includes("Ошибка")) {
        return {
          error: true,
          transcribedText,
          message: "Не удалось распознать речь",
        };
      }

      // Анализируем ответ
      const analysisResult = await this.grebenukBotService.analyzeResponse(objection.text, transcribedText);

      // Сохраняем ответ пользователя
      await this.grebenukBotService.saveUserResponse(
        userId,
        objectionId,
        transcribedText,
        null, // В MVP не сохраняем аудио
        analysisResult,
      );

      // Синтезируем речь для обратной связи
      const audioBuffer = await this.grebenukBotService.synthesizeSpeech(analysisResult.feedback);

      return {
        success: true,
        transcribedText,
        ...analysisResult,
        audioBase64: audioBuffer.toString("base64"),
      };
    } catch (error) {
      this.logger.error(`Ошибка при анализе голосового ответа: ${error.message}`);
      return {
        success: false,
        error: true,
        message: `Ошибка при анализе голосового ответа: ${error.message}`,
      };
    }
  }

  @Post("seed")
  @ApiOperation({ summary: "Инициализировать базу данных начальными данными" })
  @ApiResponse({ status: 200, description: "Результат инициализации" })
  async seedInitialData() {
    try {
      return await this.grebenukBotService.seedInitialData();
    } catch (error) {
      this.logger.error(`Ошибка при инициализации данных: ${error.message}`);
      throw error;
    }
  }

  @Post("universal")
  @ApiOperation({ summary: "Универсальный эндпоинт для всех функций бота" })
  @ApiResponse({ status: 200, description: "Результат обработки запроса" })
  async useUniversalPrompt(@Body() body: any) {
    try {
      this.logger.log(`Получен запрос к универсальному эндпоинту: ${JSON.stringify(body)}`);

      // Вместо вызова сервиса, возвращаем статические данные для отладки
      if (body.topic) {
        // Режим генерации возражений
        this.logger.log(`Возвращаем статические возражения для темы: ${body.topic}`);
        return {
          objections: [
            { text: "Это слишком дорого", category: "Цена", difficulty: 3 },
            { text: "У ваших конкурентов дешевле", category: "Цена", difficulty: 4 },
            { text: "Нет бюджета", category: "Цена", difficulty: 5 },
            { text: "Мне нужно подумать", category: "Срочность", difficulty: 2 },
            { text: "Давайте вернемся к этому позже", category: "Срочность", difficulty: 2 },
            { text: "Мне нужно посоветоваться с коллегами", category: "Срочность", difficulty: 3 },
            { text: "Я не уверен, что вы сможете решить нашу проблему", category: "Доверие", difficulty: 4 },
            { text: "У вас мало опыта в нашей отрасли", category: "Доверие", difficulty: 4 },
            { text: "Мы уже работаем с другим поставщиком", category: "Доверие", difficulty: 5 },
            { text: "Пришлите мне предложение на почту", category: "Срочность", difficulty: 1 },
            { text: "Это слишком дорого для нас", category: "Цена", difficulty: 3 },
            { text: "Мы не уверены в качестве вашего продукта", category: "Доверие", difficulty: 4 },
            { text: "Нам нужно подумать, давайте вернемся к этому через месяц", category: "Срочность", difficulty: 2 },
            { text: "У ваших конкурентов есть более выгодное предложение", category: "Цена", difficulty: 4 },
            { text: "Мы не видим, как это решит нашу проблему", category: "Доверие", difficulty: 3 },
            { text: "Ваш продукт сложный в использовании", category: "Функциональность", difficulty: 3 },
            { text: "У нас уже есть аналогичное решение", category: "Потребность", difficulty: 5 },
            { text: "Мы не уверены, что нам это нужно", category: "Потребность", difficulty: 4 },
            { text: "Ваш сервис не поддерживает нужные нам функции", category: "Функциональность", difficulty: 3 },
            { text: "Ваши условия оплаты нас не устраивают", category: "Цена", difficulty: 4 },
            { text: "Наш менеджмент против этого решения", category: "Доверие", difficulty: 5 },
            { text: "Мы сомневаемся в вашей компании", category: "Доверие", difficulty: 4 },
            { text: "Ваш продукт недостаточно инновационный", category: "Функциональность", difficulty: 3 },
            { text: "У нас нет времени разбираться с новым инструментом", category: "Срочность", difficulty: 2 },
            { text: "Ваше решение не подходит под наши процессы", category: "Функциональность", difficulty: 4 },
            { text: "Мы боимся перехода на новый сервис", category: "Доверие", difficulty: 4 },
            { text: "Ваш продукт требует слишком много ресурсов", category: "Функциональность", difficulty: 3 },
            { text: "Наш текущий поставщик нас устраивает", category: "Доверие", difficulty: 5 },
            { text: "Ваше предложение не выгоднее нашего текущего контракта", category: "Цена", difficulty: 4 },
            { text: "Ваш продукт не соответствует нашим стандартам безопасности", category: "Функциональность", difficulty: 5 },
            { text: "Мы боимся технических проблем", category: "Доверие", difficulty: 3 },
            { text: "Мы не готовы к внедрению новых технологий", category: "Потребность", difficulty: 5 },
            { text: "Ваш продукт слишком сложный для наших сотрудников", category: "Функциональность", difficulty: 3 },
            { text: "Мы не видим экономической выгоды от вашего решения", category: "Цена", difficulty: 4 },
            { text: "Ваши кейсы не убеждают нас", category: "Доверие", difficulty: 4 },
            { text: "Ваше предложение не уникально", category: "Функциональность", difficulty: 3 },
            { text: "Мы не можем позволить себе такую цену", category: "Цена", difficulty: 5 },
            { text: "Ваш продукт не поддерживает нашу интеграцию", category: "Функциональность", difficulty: 5 },
            { text: "Ваш сервис не локализован на наш язык", category: "Функциональность", difficulty: 3 },
            { text: "Нам не нравится ваш интерфейс", category: "Функциональность", difficulty: 2 },
            { text: "Мы опасаемся долгосрочных обязательств", category: "Доверие", difficulty: 4 },
            { text: "Наши клиенты не готовы к такому решению", category: "Потребность", difficulty: 4 },
            { text: "Мы не хотим зависеть от одного поставщика", category: "Доверие", difficulty: 5 },
            { text: "Ваши отзывы не выглядят убедительно", category: "Доверие", difficulty: 3 },
            { text: "Ваш продукт еще не доказал свою эффективность", category: "Доверие", difficulty: 4 },
            { text: "Мы не видим смысла в переходе на ваш сервис", category: "Потребность", difficulty: 5 },
            { text: "Наши партнеры не рекомендуют вас", category: "Доверие", difficulty: 3 },
            { text: "У вас нет поддержки 24/7", category: "Функциональность", difficulty: 3 },
            { text: "Мы не уверены в вашей технической поддержке", category: "Доверие", difficulty: 4 },
            { text: "Ваш продукт не соответствует нашим корпоративным стандартам", category: "Функциональность", difficulty: 5 },
          ],
        };
      } else if (body.objection && body.userResponse) {
        // Режим анализа ответа
        this.logger.log(`Возвращаем статический анализ ответа`);
        return {
          score: 7,
          hasRecognition: true,
          hasArgument: true,
          hasReversal: false,
          hasCallToAction: true,
          idealResponse: `Я понимаю ваше беспокойство о ${body.objection}. Давайте рассмотрим это подробнее...`,
          feedback: "Неплохо, но можно лучше. Ты признал возражение и привел аргументы, но не перевернул ситуацию в свою пользу.",
          errors: ["Отсутствует переворот возражения", "Слабая аргументация"],
        };
      } else if (body.userRequest) {
        // Режим анализа запроса
        this.logger.log(`Возвращаем статический анализ запроса`);
        return {
          isValid: false,
          errors: ["Запрос слишком размытый", "Отсутствует конкретика"],
          suggestions: ["Добавьте конкретные цифры", "Укажите точные сроки"],
          grebenukResponse: "Ты серьезно думаешь, что с таким размытым запросом можно что-то продать? Конкретика, цифры, факты - вот что нужно!",
        };
      }

      // Если ни один из режимов не подходит
      return {
        error: "Неверный формат запроса",
        message: "Укажите topic, objection+userResponse или userRequest",
      };
    } catch (error) {
      this.logger.error(`Ошибка при обработке универсального запроса: ${error.message}`);
      if (error.response) {
        this.logger.error(`Статус ошибки: ${error.response.status}`);
        this.logger.error(`Данные ошибки: ${JSON.stringify(error.response.data)}`);
      }
      // Возвращаем заглушку для отладки
      return {
        error: "Произошла ошибка при обработке запроса",
        message: error.message,
        objections: [
          { text: "Это слишком дорого", category: "Цена", difficulty: 3 },
          { text: "У ваших конкурентов дешевле", category: "Цена", difficulty: 4 },
          { text: "Нет бюджета", category: "Цена", difficulty: 5 },
          { text: "Мне нужно подумать", category: "Срочность", difficulty: 2 },
          { text: "Давайте вернемся к этому позже", category: "Срочность", difficulty: 2 },
          { text: "Мне нужно посоветоваться с коллегами", category: "Срочность", difficulty: 3 },
          { text: "Я не уверен, что вы сможете решить нашу проблему", category: "Доверие", difficulty: 4 },
          { text: "У вас мало опыта в нашей отрасли", category: "Доверие", difficulty: 4 },
          { text: "Мы уже работаем с другим поставщиком", category: "Доверие", difficulty: 5 },
          { text: "Пришлите мне предложение на почту", category: "Срочность", difficulty: 1 },
          { text: "Это слишком дорого для нас", category: "Цена", difficulty: 3 },
          { text: "Мы не уверены в качестве вашего продукта", category: "Доверие", difficulty: 4 },
          { text: "Нам нужно подумать, давайте вернемся к этому через месяц", category: "Срочность", difficulty: 2 },
          { text: "У ваших конкурентов есть более выгодное предложение", category: "Цена", difficulty: 4 },
          { text: "Мы не видим, как это решит нашу проблему", category: "Доверие", difficulty: 3 },
          { text: "Ваш продукт сложный в использовании", category: "Функциональность", difficulty: 3 },
          { text: "У нас уже есть аналогичное решение", category: "Потребность", difficulty: 5 },
          { text: "Мы не уверены, что нам это нужно", category: "Потребность", difficulty: 4 },
          { text: "Ваш сервис не поддерживает нужные нам функции", category: "Функциональность", difficulty: 3 },
          { text: "Ваши условия оплаты нас не устраивают", category: "Цена", difficulty: 4 },
          { text: "Наш менеджмент против этого решения", category: "Доверие", difficulty: 5 },
          { text: "Мы сомневаемся в вашей компании", category: "Доверие", difficulty: 4 },
          { text: "Ваш продукт недостаточно инновационный", category: "Функциональность", difficulty: 3 },
          { text: "У нас нет времени разбираться с новым инструментом", category: "Срочность", difficulty: 2 },
          { text: "Ваше решение не подходит под наши процессы", category: "Функциональность", difficulty: 4 },
          { text: "Мы боимся перехода на новый сервис", category: "Доверие", difficulty: 4 },
          { text: "Ваш продукт требует слишком много ресурсов", category: "Функциональность", difficulty: 3 },
          { text: "Наш текущий поставщик нас устраивает", category: "Доверие", difficulty: 5 },
          { text: "Ваше предложение не выгоднее нашего текущего контракта", category: "Цена", difficulty: 4 },
          { text: "Ваш продукт не соответствует нашим стандартам безопасности", category: "Функциональность", difficulty: 5 },
          { text: "Мы боимся технических проблем", category: "Доверие", difficulty: 3 },
          { text: "Мы не готовы к внедрению новых технологий", category: "Потребность", difficulty: 5 },
          { text: "Ваш продукт слишком сложный для наших сотрудников", category: "Функциональность", difficulty: 3 },
          { text: "Мы не видим экономической выгоды от вашего решения", category: "Цена", difficulty: 4 },
          { text: "Ваши кейсы не убеждают нас", category: "Доверие", difficulty: 4 },
          { text: "Ваше предложение не уникально", category: "Функциональность", difficulty: 3 },
          { text: "Мы не можем позволить себе такую цену", category: "Цена", difficulty: 5 },
          { text: "Ваш продукт не поддерживает нашу интеграцию", category: "Функциональность", difficulty: 5 },
          { text: "Ваш сервис не локализован на наш язык", category: "Функциональность", difficulty: 3 },
          { text: "Нам не нравится ваш интерфейс", category: "Функциональность", difficulty: 2 },
          { text: "Мы опасаемся долгосрочных обязательств", category: "Доверие", difficulty: 4 },
          { text: "Наши клиенты не готовы к такому решению", category: "Потребность", difficulty: 4 },
          { text: "Мы не хотим зависеть от одного поставщика", category: "Доверие", difficulty: 5 },
          { text: "Ваши отзывы не выглядят убедительно", category: "Доверие", difficulty: 3 },
          { text: "Ваш продукт еще не доказал свою эффективность", category: "Доверие", difficulty: 4 },
          { text: "Мы не видим смысла в переходе на ваш сервис", category: "Потребность", difficulty: 5 },
          { text: "Наши партнеры не рекомендуют вас", category: "Доверие", difficulty: 3 },
          { text: "У вас нет поддержки 24/7", category: "Функциональность", difficulty: 3 },
          { text: "Мы не уверены в вашей технической поддержке", category: "Доверие", difficulty: 4 },
          { text: "Ваш продукт не соответствует нашим корпоративным стандартам", category: "Функциональность", difficulty: 5 },
        ],
      };
    }
  }

  @Post("process-voice")
  @ApiOperation({ summary: "Обработать голосовое сообщение через Coze API и синтезировать ответ" })
  @ApiResponse({ status: 200, description: "Результат обработки голосового сообщения" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("audio"))
  async processVoiceMessage(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException("Аудио файл не предоставлен");
      }

      const result = await this.grebenukBotService.processVoiceMessage(file.buffer);

      return {
        success: true,
        transcribedText: result.transcribedText,
        processedText: result.processedText,
        audioUrl: `data:audio/mp3;base64,${result.audioBuffer.toString("base64")}`,
        objection: result.objection,
        message: "Давай попробуем еще раз!",
      };
    } catch (error) {
      this.logger.error(`Ошибка при обработке голосового сообщения: ${error.message}`);
      throw error;
    }
  }

  @Post("generate-objections-coze")
  @ApiOperation({ summary: "Генерация возражений через Coze" })
  @ApiResponse({ status: 200, description: "Сгенерированные возражения" })
  async generateObjectionsCoze(@Body() body: { topic: string }) {
    try {
      this.logger.log(`Получен запрос на генерацию возражений через Coze для темы: ${body.topic}`);
      return await this.grebenukBotService.sendCozeRequest(body.topic);
    } catch (error) {
      this.logger.error(`Ошибка при генерации возражений через Coze: ${error.message}`);
      if (error.response) {
        this.logger.error(`Статус ошибки: ${error.response.status}`);
        this.logger.error(`Данные ошибки: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  @Get("voices/my")
  @ApiOperation({ summary: "Получить список ваших голосов" })
  @ApiResponse({ status: 200, description: "Список ваших голосов" })
  async getMyVoices() {
    try {
      this.logger.log("Запрос на получение списка голосов");
      const voices = await this.grebenukBotService.getMyVoices();

      // Находим голос grebenuk если он есть
      const grebenukVoice = voices.find(voice => voice.name.toLowerCase() === "grebenuk");
      if (grebenukVoice) {
        this.logger.log(`Найден голос grebenuk с ID: ${grebenukVoice.id}`);
      } else {
        this.logger.log("Голос grebenuk не найден в списке голосов");
      }

      return {
        totalVoices: voices.length,
        voices,
        grebenukVoice: grebenukVoice || null,
      };
    } catch (error) {
      this.logger.error(`Ошибка при получении списка голосов: ${error.message}`);
      throw error;
    }
  }

  @Get("voices/favorite")
  @ApiOperation({ summary: "Получить список избранных голосов" })
  @ApiResponse({ status: 200, description: "Список избранных голосов" })
  async getMyFavoriteVoices() {
    try {
      this.logger.log("Запрос на получение списка избранных голосов");
      const response = await axios.get(`https://tts-backend.voice.ai/dev/api/v1/voices/my-favorite`, {
        headers: {
          "X-API-Token": this.configService.get<string>("AI_VOICE_API_KEY"),
        },
      });

      return {
        totalVoices: response.data.length,
        voices: response.data,
      };
    } catch (error) {
      this.logger.error(`Ошибка при получении списка избранных голосов: ${error.message}`);
      throw error;
    }
  }
}
