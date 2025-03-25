import { createHmac } from "crypto";

export function verifyTelegramWebAppData(initData: string): boolean {
  try {
    const searchParams = new URLSearchParams(initData);
    const hash = searchParams.get("hash");
    if (!hash) return false;

    searchParams.delete("hash");

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return false;

    const dataCheckString = Array.from(searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

    const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    return calculatedHash === hash;
  } catch (error) {
    console.error("Error verifying Telegram WebApp data:", error);
    return false;
  }
}
