declare namespace Express {
  interface Request {
    telegramUser?: {
      id: string;
    };
  }
}
