import { log } from "./logger";

/**
 * Best-effort alerting to a webhook (Discord / Slack-compatible). Fire-and-
 * forget — alerting must never throw into the keeper loop. Enable by setting
 * KEEPER_ALERT_WEBHOOK. Rate-limited per message key to avoid spamming on a
 * repeated failure.
 */

const WEBHOOK = process.env.KEEPER_ALERT_WEBHOOK ?? "";
const MIN_INTERVAL_MS = Number(process.env.KEEPER_ALERT_MIN_INTERVAL_MS ?? "300000"); // 5 min

const lastSentByKey = new Map<string, number>();

export async function alert(key: string, message: string, fields?: Record<string, unknown>) {
  // Always log locally regardless of webhook config.
  log.warn("alert", { key, message, ...fields });

  if (!WEBHOOK) return;

  const now = Date.now();
  const last = lastSentByKey.get(key) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return; // rate-limit duplicates
  lastSentByKey.set(key, now);

  const lines = [
    `**ZeroSight Keeper Alert**`,
    `\`${key}\` — ${message}`,
    ...(fields
      ? Object.entries(fields).map(([k, v]) => `• ${k}: \`${stringify(v)}\``)
      : [])
  ];

  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") })
    });
  } catch (err) {
    log.error("alert.failed", { err: err instanceof Error ? err.message : String(err) });
  }
}

function stringify(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && v !== null) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
