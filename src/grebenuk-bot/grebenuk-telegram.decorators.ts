import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { TelegrafExecutionContext } from "nestjs-telegraf";
import { Context } from "telegraf";

export const TelegramUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const telegrafCtx = TelegrafExecutionContext.create(ctx);
  const context = telegrafCtx.getContext<Context>();
  return context.from;
});

export const TelegramMessage = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const telegrafCtx = TelegrafExecutionContext.create(ctx);
  const context = telegrafCtx.getContext<Context>();
  return context.message;
});

export const TelegramSession = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const telegrafCtx = TelegrafExecutionContext.create(ctx);
  const context = telegrafCtx.getContext<Context>();
  return (context as any).session;
});
