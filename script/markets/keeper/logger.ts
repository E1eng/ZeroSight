/**
 * Tiny structured logger. Emits JSON lines so downstream tools (jq, journalctl,
 * datadog) can parse trivially. Falls back to pretty mode when stdout is a TTY.
 */
const isTty = process.stdout.isTTY ?? false;

type Level = "debug" | "info" | "warn" | "error";

const COLORS: Record<Level, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m"
};
const RESET = "\x1b[0m";

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const ts = new Date().toISOString();
  if (isTty) {
    const c = COLORS[level];
    const tag = `${c}[${level.toUpperCase()}]${RESET}`;
    const fieldStr = Object.keys(fields).length
      ? " " + Object.entries(fields).map(([k, v]) => `${k}=${stringify(v)}`).join(" ")
      : "";
    // eslint-disable-next-line no-console
    console.log(`${ts} ${tag} ${msg}${fieldStr}`);
  } else {
    process.stdout.write(JSON.stringify({ ts, level, msg, ...fields }) + "\n");
  }
}

function stringify(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return String(v);
  try {
    return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
  } catch {
    return String(v);
  }
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields)
};
