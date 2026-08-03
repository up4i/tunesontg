export {};

const token = process.env.TELEGRAM_BOT_TOKEN;
const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !appOrigin || !secret) {
  throw new Error(
    "Set TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL, and TELEGRAM_WEBHOOK_SECRET first.",
  );
}
if (!appOrigin.startsWith("https://")) {
  throw new Error("NEXT_PUBLIC_APP_URL must be a public HTTPS URL.");
}

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { ok: boolean; description?: string };
  if (!response.ok || !data.ok) throw new Error(data.description ?? `${method} failed.`);
}

await telegram("setWebhook", {
  url: `${appOrigin}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ["message"],
});
await telegram("setMyCommands", {
  commands: [
    { command: "start", description: "Open your music inbox" },
    { command: "help", description: "How to add music" },
  ],
});
await telegram("setChatMenuButton", {
  menu_button: { type: "web_app", text: "My music", web_app: { url: appOrigin } },
});

console.log(`Webhook and menu button configured for ${appOrigin}`);
