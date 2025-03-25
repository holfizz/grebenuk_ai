import { Ctx, Hears, On, Start, Update } from "nestjs-telegraf";
import { Context } from "telegraf";
import { GrebenukTelegramUpdate } from "./grebenuk-telegram.update";

@Update()
export class GrebenukTelegramCommands {
  constructor(private readonly telegramUpdate: GrebenukTelegramUpdate) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    return this.telegramUpdate.onStart(ctx);
  }

  @Hears("🎯 Случайное возражение")
  async onRandomObjection(@Ctx() ctx: Context) {
    return this.telegramUpdate.onRandomObjection(ctx);
  }

  @Hears(["💰 Возражения по цене", "🤝 Возражения по доверию", "⏱ Возражения по срочности"])
  async onCategorySelect(@Ctx() ctx: Context) {
    return this.telegramUpdate.onCategorySelect(ctx);
  }

  @Hears("🔄 Другое возражение")
  async onAnotherObjection(@Ctx() ctx: Context) {
    return this.telegramUpdate.onRandomObjection(ctx);
  }

  @Hears("🏠 Главное меню")
  async onMainMenu(@Ctx() ctx: Context) {
    return this.telegramUpdate.onMainMenu(ctx);
  }

  @Hears("🤖 Сгенерировать возражения")
  async onGenerateObjections(@Ctx() ctx: Context) {
    return this.telegramUpdate.onGenerateObjectionsMenu(ctx);
  }

  @On("text")
  async onText(@Ctx() ctx: Context) {
    return this.telegramUpdate.onTextResponse(ctx);
  }

  @On("voice")
  async onVoice(@Ctx() ctx: Context) {
    return this.telegramUpdate.onVoice(ctx);
  }
}
