import { getDb } from "../db/sqlite";

export type TargetedExploreRollType = "weakest" | "rotation";

export function recordTargetedExploreRoll(params: { type: TargetedExploreRollType; hit: boolean }): void {
  const db = getDb();
  if (params.type === "weakest") {
    db.prepare(
      `UPDATE targeted_explore_stats_singleton SET attempts_weakest = attempts_weakest + 1 WHERE id = 1`,
    ).run();
    if (params.hit) {
      db.prepare(`UPDATE targeted_explore_stats_singleton SET hits_weakest = hits_weakest + 1 WHERE id = 1`).run();
    }
    return;
  }
  db.prepare(
    `UPDATE targeted_explore_stats_singleton SET attempts_rotation = attempts_rotation + 1 WHERE id = 1`,
  ).run();
  if (params.hit) {
    db.prepare(`UPDATE targeted_explore_stats_singleton SET hits_rotation = hits_rotation + 1 WHERE id = 1`).run();
  }
}

/** Mean lift of after-dominance over baseline-dominance when exploration text was chosen (same prompt, both scan passes). */
export function recordTargetedExploreLift(params: { type: TargetedExploreRollType; delta: number }): void {
  if (!Number.isFinite(params.delta)) return;
  const db = getDb();
  if (params.type === "weakest") {
    db.prepare(
      `UPDATE targeted_explore_stats_singleton SET lift_sum_weakest = lift_sum_weakest + ?, lift_n_weakest = lift_n_weakest + 1 WHERE id = 1`,
    ).run(params.delta);
    return;
  }
  db.prepare(
    `UPDATE targeted_explore_stats_singleton SET lift_sum_rotation = lift_sum_rotation + ?, lift_n_rotation = lift_n_rotation + 1 WHERE id = 1`,
  ).run(params.delta);
}

export type TargetedExploreRollCounts = {
  attempts_weakest: number;
  hits_weakest: number;
  attempts_rotation: number;
  hits_rotation: number;
  lift_sum_weakest: number;
  lift_n_weakest: number;
  lift_sum_rotation: number;
  lift_n_rotation: number;
};

export function loadTargetedExploreRollCounts(): TargetedExploreRollCounts {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT attempts_weakest AS aw, hits_weakest AS hw,
              attempts_rotation AS ar, hits_rotation AS hr,
              lift_sum_weakest AS lsw, lift_n_weakest AS lnw,
              lift_sum_rotation AS lsr, lift_n_rotation AS lnr
       FROM targeted_explore_stats_singleton WHERE id = 1`,
    )
    .get() as
    | {
        aw: number;
        hw: number;
        ar: number;
        hr: number;
        lsw: number;
        lnw: number;
        lsr: number;
        lnr: number;
      }
    | undefined;
  return {
    attempts_weakest: row?.aw ?? 0,
    hits_weakest: row?.hw ?? 0,
    attempts_rotation: row?.ar ?? 0,
    hits_rotation: row?.hr ?? 0,
    lift_sum_weakest: row?.lsw ?? 0,
    lift_n_weakest: row?.lnw ?? 0,
    lift_sum_rotation: row?.lsr ?? 0,
    lift_n_rotation: row?.lnr ?? 0,
  };
}
