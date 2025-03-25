<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ pnpm install
```

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).

# whai_eng_backend

# whai_eng_backend

# whai_eng_backend

# calai_back

# yourmuse_back

# ivoice_back

# ivoice_back

# itodo_back

# AI-бот «Гребенюк против вас»

## Описание

AI-бот, который имитирует стиль общения Михаила Гребенюка, выдает возражения, анализирует ответы пользователей и дает голосовую обратную связь.

### Основной функционал MVP

1. **Генерация возражений**

   - Бот случайным образом выдает одно из 10 популярных возражений (например, «Дорого», «Мне надо подумать»).
   - У пользователя есть возможность выбрать категорию возражений (цена, доверие, срочность).

2. **Запись ответа пользователя**

   - Пользователь записывает голосом или вводит текстом.

3. **Анализ ответа**

   - Распознавание речи → текст (Whisper).
   - AI проверяет, есть ли в ответе:
     - Признание возражения.
     - Аргументация.
     - Переворот возражения.
     - Призыв к действию.
   - Выдает оценку по шкале 1-10.

4. **Ответ от «Гребенюка»**
   - AI генерирует идеальный ответ.
   - Отправляет его голосом Михаила (синтез через ElevenLabs API).
   - Если ответ пользователя плохой – иронично давит, шутит.
   - Если хороший – хвалит, но предлагает улучшение.

## Технологии

- **Бэкенд**: NestJS (TypeScript)
- **ML-модель**: GPT-4 + Whisper (распознавание речи)
- **База данных**: PostgreSQL
- **Голос**: ElevenLabs API
- **Интерфейс**: Telegram-бот

## Установка и запуск

### Предварительные требования

- Node.js (v18+)
- PostgreSQL
- Telegram Bot Token (получить у [@BotFather](https://t.me/BotFather))
- OpenAI API Key
- ElevenLabs API Key

### Установка

1. Клонировать репозиторий:

```bash
git clone https://github.com/yourusername/grebenuk-ai.git
cd grebenuk-ai
```

2. Установить зависимости:

```bash
pnpm install
```

3. Создать файл .env на основе .env.example:

```bash
cp .env.example .env
```

4. Заполнить переменные окружения в файле .env:

```bash
DATABASE_URL="postgresql://username:password@localhost:5432/grebenuk_bot?schema=public"
TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
ELEVENLABS_API_KEY="YOUR_ELEVENLABS_API_KEY"
ELEVENLABS_VOICE_ID="YOUR_ELEVENLABS_VOICE_ID"
```

5. Применить миграции базы данных:

```bash
pnpm prisma:migrate
```

6. Заполнить базу данных начальными данными:

```bash
pnpm prisma db seed
```

### Запуск

Запустить в режиме разработки:

```bash
pnpm run dev
```

Запустить в продакшн режиме:

```bash
pnpm run build
pnpm run start:prod
```

## Использование

1. Найдите бота в Telegram по имени, которое вы указали при создании бота у @BotFather.
2. Отправьте команду `/start` для начала работы.
3. Выберите категорию возражений или получите случайное возражение.
4. Ответьте на возражение голосом или текстом.
5. Получите анализ вашего ответа и обратную связь от "Гребенюка".
# grebenuk_ai
