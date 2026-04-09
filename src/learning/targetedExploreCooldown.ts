import { getDb } from "../db/sqlite";

/** When true, cooldown timestamps survive process restarts (same DB as jobs). */
export function isTargetedExploreCooldownPersisted(): boolean {
  const v = process.env.TARGETED_EXPLORE_COOLDOWN_PERSIST?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Min ms between SQLite writes for the same intent (memory always updates). `0` = write every time. */
export function targetedCooldownDbThrottleMs(): number {
  const raw = process.env.TARGETED_EXPLORE_COOLDOWN_DB_THROTTLE_MS?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

const lastCooldownDbWriteAtByIntent = new Map<string, number>();

export function getTargetedExploreLastMs(intent: string, memory: Map<string, number>): number {
  const mem = memory.get(intent) ?? 0;
  if (!isTargetedExploreCooldownPersisted()) return mem;
  const row = getDb()
    .prepare(`SELECT last_ms AS m FROM targeted_explore_cooldown WHERE intent = ?`)
    .get(intent) as { m: number } | undefined;
  const db = row?.m != null && Number.isFinite(row.m) ? row.m : 0;
  return Math.max(mem, db);
}

export function setTargetedExploreLastMs(
  intent: string,
  ms: number,
  memory: Map<string, number>,
  nowMs: number = Date.now(),
): void {
  memory.set(intent, ms);
  if (!isTargetedExploreCooldownPersisted()) return;
  const throttle = targetedCooldownDbThrottleMs();
  const lastWrite = lastCooldownDbWriteAtByIntent.get(intent) ?? 0;
  if (throttle > 0 && nowMs - lastWrite < throttle) {
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO targeted_explore_cooldown (intent, last_ms) VALUES (?, ?)
       ON CONFLICT(intent) DO UPDATE SET last_ms = excluded.last_ms`,
    )
    .run(intent, Math.trunc(ms));
  lastCooldownDbWriteAtByIntent.set(intent, nowMs);
}
