/**
 * HOLD notifications.
 *
 * Env-gated by design: with no webhook configured this is a silent no-op, and the hold
 * record still exists — a notification is an amplifier for the human gate, not the
 * source of truth. A failed send is reported in the result, never thrown: the caller
 * must not fail a hold decision because Discord was down.
 */

export interface NotifyTargets {
  readonly discordWebhookUrl?: string;
  readonly telegramBotToken?: string;
  readonly telegramChatId?: string;
}

export interface HoldEvent {
  readonly holdId: string;
  readonly intentId: string;
  readonly status: "held" | "released" | "cancelled";
  readonly digest: string;
  readonly reasons: readonly { code: string; message: string }[];
  readonly at: string;
}

export interface NotifyResult {
  readonly discord: boolean;
  readonly telegram: boolean;
}

function messageFor(event: HoldEvent): string {
  const reasons = event.reasons.map((r) => `${r.code}: ${r.message}`).join(" | ");
  return [
    `noyeet HOLD ${event.status} — ${event.intentId} (${event.holdId})`,
    reasons,
    `digest ${event.digest}`,
    event.at,
  ].join("\n");
}

/** Targets from the environment; a missing webhook is simply no target. */
export function envTargets(env: Record<string, string | undefined> = process.env): NotifyTargets {
  return {
    ...(env["DISCORD_WEBHOOK_URL"] ? { discordWebhookUrl: env["DISCORD_WEBHOOK_URL"] } : {}),
    ...(env["TELEGRAM_BOT_TOKEN"] ? { telegramBotToken: env["TELEGRAM_BOT_TOKEN"] } : {}),
    ...(env["TELEGRAM_CHAT_ID"] ? { telegramChatId: env["TELEGRAM_CHAT_ID"] } : {}),
  };
}

export async function notifyHold(
  event: HoldEvent,
  targets: NotifyTargets = envTargets(),
  fetchImpl: typeof fetch = fetch,
): Promise<NotifyResult> {
  let discord = false;
  let telegram = false;
  const text = messageFor(event);

  if (targets.discordWebhookUrl !== undefined) {
    try {
      const response = await fetchImpl(targets.discordWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      discord = response.ok;
    } catch {
      discord = false;
    }
  }

  if (targets.telegramBotToken !== undefined && targets.telegramChatId !== undefined) {
    try {
      const response = await fetchImpl(
        `https://api.telegram.org/bot${targets.telegramBotToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: targets.telegramChatId, text }),
        },
      );
      telegram = response.ok;
    } catch {
      telegram = false;
    }
  }

  return { discord, telegram };
}
