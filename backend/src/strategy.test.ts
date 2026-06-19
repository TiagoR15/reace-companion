import { describe, expect, it } from "vitest";
import { GREEN_TIME_SEC, RULES, STINT_COUNT, greenTimeSec } from "./rules.js";
import {
  applyScheduleEdit,
  computeStintPlan,
  rebalanceSchedule,
  recalculateSchedule,
  suggestBallast,
  buildSchedule,
} from "./strategy.js";
import type { Driver, ScheduleRow, StintPlan } from "./types.js";

function drivers(...names: string[]): Driver[] {
  return names.map((name, i) => ({ id: `d${i}`, name }));
}

describe("computeStintPlan", () => {
  it("produces 11 stints summing to GREEN_TIME_SEC, none over 45min, every driver used", () => {
    const plan = computeStintPlan(drivers("Ana", "Bruno", "Carla", "Duarte"));
    expect("error" in plan).toBe(false);
    const stints = plan as StintPlan[];

    expect(stints).toHaveLength(STINT_COUNT);
    expect(stints.reduce((a, s) => a + s.plannedDurationSec, 0)).toBe(GREEN_TIME_SEC);
    for (const s of stints) {
      expect(s.plannedDurationSec).toBeGreaterThan(0);
      expect(s.plannedDurationSec).toBeLessThanOrEqual(RULES.maxStintSec);
    }

    const driverIds = new Set(stints.map((s) => s.driverId));
    expect(driverIds.size).toBe(4);
  });

  it("respects a lower per-driver maximum", () => {
    const ds = drivers("Ana", "Bruno", "Carla");
    ds[1].maxStintSec = 20 * 60; // Bruno só aguenta 20 min

    const plan = computeStintPlan(ds) as StintPlan[];
    const brunoStints = plan.filter((s) => s.driverId === "d1");
    expect(brunoStints.length).toBeGreaterThan(0);
    for (const s of brunoStints) {
      expect(s.plannedDurationSec).toBeLessThanOrEqual(20 * 60);
    }
    expect(plan.reduce((a, s) => a + s.plannedDurationSec, 0)).toBe(GREEN_TIME_SEC);
  });

  it("ignores maxStintSec above the regulation cap (45min)", () => {
    const ds = drivers("Ana", "Bruno");
    ds[0].maxStintSec = 60 * 60; // pediu 60min, mas o regulamento limita a 45

    const plan = computeStintPlan(ds) as StintPlan[];
    for (const s of plan) {
      expect(s.plannedDurationSec).toBeLessThanOrEqual(RULES.maxStintSec);
    }
  });

  it("returns an error when the configured maximums cannot cover the race", () => {
    const ds = drivers("Ana", "Bruno");
    ds[0].maxStintSec = 5 * 60;
    ds[1].maxStintSec = 5 * 60;

    const plan = computeStintPlan(ds);
    expect("error" in plan).toBe(true);
  });

  it("rejects driver counts outside 2-7", () => {
    expect("error" in computeStintPlan(drivers("Solo"))).toBe(true);
    expect(
      "error" in computeStintPlan(drivers("A", "B", "C", "D", "E", "F", "G", "H")),
    ).toBe(true);
  });

  it("uses a custom race duration to compute the green time", () => {
    const raceDurationSec = 3 * 3600; // prova de 3h
    const plan = computeStintPlan(drivers("Ana", "Bruno", "Carla"), raceDurationSec) as StintPlan[];

    expect(plan.reduce((a, s) => a + s.plannedDurationSec, 0)).toBe(greenTimeSec(raceDurationSec));
    for (const s of plan) {
      expect(s.plannedDurationSec).toBeLessThanOrEqual(RULES.maxStintSec);
    }
  });

  it("rejects an invalid race duration", () => {
    expect("error" in computeStintPlan(drivers("Ana", "Bruno"), 0)).toBe(true);
    expect("error" in computeStintPlan(drivers("Ana", "Bruno"), -10)).toBe(true);
  });
});

describe("buildSchedule / recalculateSchedule", () => {
  it("interleaves turnos and boxes (11 turnos, 10 boxes)", () => {
    const plan = computeStintPlan(drivers("Ana", "Bruno", "Carla")) as StintPlan[];
    const schedule = buildSchedule(plan);

    const turnos = schedule.filter((r) => r.kind === "turno");
    const boxes = schedule.filter((r) => r.kind === "box");
    expect(turnos).toHaveLength(11);
    expect(boxes).toHaveLength(10);
    expect(schedule[0].kind).toBe("turno");
    expect(schedule[schedule.length - 1].kind).toBe("turno");
  });

  it("cascades a real exit time to downstream rows", () => {
    const plan = computeStintPlan(drivers("Ana", "Bruno", "Carla")) as StintPlan[];
    let schedule = buildSchedule(plan);

    const raceStartAt = Date.UTC(2026, 5, 13, 10, 30, 0);
    schedule = recalculateSchedule(schedule, raceStartAt);
    expect(schedule[0].etaInMs).toBe(raceStartAt);

    // O 1º turno demora mais do que o previsto.
    const target0 = schedule[0].targetSec;
    const actual0 = target0 + 120; // 2 minutos de atraso
    schedule[0] = {
      ...schedule[0],
      actualSec: actual0,
      actualOutMs: raceStartAt + actual0 * 1000,
    };

    schedule = recalculateSchedule(schedule, raceStartAt);
    expect(schedule[0].deltaSec).toBe(120);
    // A entrada da BOX 1 (linha seguinte) deve refletir a saída real do turno 1.
    expect(schedule[1].etaInMs).toBe(raceStartAt + actual0 * 1000);
  });
});

describe("applyScheduleEdit", () => {
  const ds = drivers("Ana", "Bruno", "Carla");
  const raceStartAt = Date.UTC(2026, 5, 13, 10, 30, 0);

  function setup() {
    const plan = computeStintPlan(ds) as StintPlan[];
    const schedule = recalculateSchedule(buildSchedule(plan), raceStartAt);
    return { plan, schedule };
  }

  it("changes the driver of a pending turno and updates the plan", () => {
    const { plan, schedule } = setup();
    const result = applyScheduleEdit(schedule, plan, ds, "turno-2", { driverId: "d2" });
    expect("error" in result).toBe(false);
    const { schedule: newSchedule, plan: newPlan } = result as {
      schedule: ScheduleRow[];
      plan: StintPlan[];
    };

    const turno2 = newSchedule.find((r) => r.id === "turno-2")!;
    expect(turno2.driverId).toBe("d2");
    expect(turno2.driverName).toBe("Carla");
    expect(newPlan[1].driverId).toBe("d2");
    expect(newPlan[1].driverName).toBe("Carla");
  });

  it("changes the target time and cascades the ETAs of subsequent rows", () => {
    const { plan, schedule } = setup();
    const turno1 = schedule.find((r) => r.id === "turno-1")!;
    const newTarget = turno1.targetSec + 300; // +5 minutos

    const result = applyScheduleEdit(schedule, plan, ds, "turno-1", { targetSec: newTarget });
    expect("error" in result).toBe(false);
    const { schedule: edited, plan: newPlan } = result as {
      schedule: ScheduleRow[];
      plan: StintPlan[];
    };

    expect(edited.find((r) => r.id === "turno-1")!.targetSec).toBe(newTarget);
    expect(newPlan[0].plannedDurationSec).toBe(newTarget);

    const recalculated = recalculateSchedule(edited, raceStartAt);
    const box1 = recalculated.find((r) => r.id === "box-1")!;
    // BOX 1 entra 5 minutos mais tarde por causa do alvo maior do Turno 1.
    expect(box1.etaInMs).toBe(raceStartAt + newTarget * 1000);
  });

  it("rejects edits to rows that don't exist, aren't turnos, or are already done", () => {
    const { plan, schedule } = setup();

    expect("error" in applyScheduleEdit(schedule, plan, ds, "turno-99", { targetSec: 60 })).toBe(
      true,
    );
    expect("error" in applyScheduleEdit(schedule, plan, ds, "box-1", { targetSec: 60 })).toBe(
      true,
    );

    const done = schedule.map((r) =>
      r.id === "turno-1" ? { ...r, actualSec: r.targetSec, actualOutMs: raceStartAt } : r,
    );
    expect("error" in applyScheduleEdit(done, plan, ds, "turno-1", { targetSec: 60 })).toBe(true);
  });

  it("rejects an unknown driverId or a non-positive target", () => {
    const { plan, schedule } = setup();
    expect("error" in applyScheduleEdit(schedule, plan, ds, "turno-1", { driverId: "nope" })).toBe(
      true,
    );
    expect("error" in applyScheduleEdit(schedule, plan, ds, "turno-1", { targetSec: 0 })).toBe(
      true,
    );
    expect("error" in applyScheduleEdit(schedule, plan, ds, "turno-1", { targetSec: -5 })).toBe(
      true,
    );
  });
});

describe("rebalanceSchedule", () => {
  const ds = drivers("Ana", "Bruno", "Carla");

  function setup() {
    const plan = computeStintPlan(ds) as StintPlan[];
    const schedule = buildSchedule(plan);
    return { plan, schedule };
  }

  it("absorbs an overrun on a completed turno by shrinking the pending turnos' targets", () => {
    const { schedule } = setup();
    const turno1 = schedule.find((r) => r.id === "turno-1")!;
    const overrun = 300; // turno-1 demorou 5 minutos a mais
    const pendingTargetsBefore = schedule
      .filter((r) => r.kind === "turno" && r.id !== "turno-1")
      .reduce((a, r) => a + r.targetSec, 0);

    const withActual = schedule.map((r) =>
      r.id === "turno-1" ? { ...r, actualSec: r.targetSec + overrun } : r,
    );
    const rebalanced = rebalanceSchedule(withActual, ds, RULES.raceDurationSec);

    const pendingTargetsAfter = rebalanced
      .filter((r) => r.kind === "turno" && r.id !== "turno-1")
      .reduce((a, r) => a + r.targetSec, 0);

    // O turno-1 não é alterado (já concluído).
    expect(rebalanced.find((r) => r.id === "turno-1")!.targetSec).toBe(turno1.targetSec);
    // O excesso é absorvido pelos turnos pendentes.
    expect(pendingTargetsAfter).toBe(pendingTargetsBefore - overrun);
    // O total continua igual ao tempo de pista disponível.
    expect((withActual.find((r) => r.id === "turno-1")!.actualSec ?? 0) + pendingTargetsAfter).toBe(
      GREEN_TIME_SEC,
    );
  });

  it("absorbs an underrun by growing the pending turnos' targets", () => {
    const { schedule } = setup();
    const undershoot = 180; // turno-1 demorou 3 minutos a menos
    const pendingTargetsBefore = schedule
      .filter((r) => r.kind === "turno" && r.id !== "turno-1")
      .reduce((a, r) => a + r.targetSec, 0);

    const withActual = schedule.map((r) =>
      r.id === "turno-1" ? { ...r, actualSec: r.targetSec - undershoot } : r,
    );
    const rebalanced = rebalanceSchedule(withActual, ds, RULES.raceDurationSec);

    const pendingTargetsAfter = rebalanced
      .filter((r) => r.kind === "turno" && r.id !== "turno-1")
      .reduce((a, r) => a + r.targetSec, 0);

    expect(pendingTargetsAfter).toBe(pendingTargetsBefore + undershoot);
  });

  it("does not change locked turnos, redistributing only across the remaining ones", () => {
    const { schedule } = setup();
    const lockedTarget = schedule.find((r) => r.id === "turno-2")!.targetSec + 600;

    const edited = schedule.map((r) =>
      r.id === "turno-2" ? { ...r, targetSec: lockedTarget, locked: true } : r,
    );
    const rebalanced = rebalanceSchedule(edited, ds, RULES.raceDurationSec);

    expect(rebalanced.find((r) => r.id === "turno-2")!.targetSec).toBe(lockedTarget);

    const total = rebalanced
      .filter((r) => r.kind === "turno")
      .reduce((a, r) => a + r.targetSec, 0);
    expect(total).toBe(GREEN_TIME_SEC);
  });

  it("respects each driver's maxStintSec cap when redistributing", () => {
    const capped = drivers("Ana", "Bruno", "Carla");
    capped[1].maxStintSec = 10 * 60; // Bruno só aguenta 10 min

    const plan = computeStintPlan(capped) as StintPlan[];
    const schedule = buildSchedule(plan);

    const withActual = schedule.map((r) =>
      r.id === "turno-1" ? { ...r, actualSec: r.targetSec + 600 } : r,
    );
    const rebalanced = rebalanceSchedule(withActual, capped, RULES.raceDurationSec);

    for (const row of rebalanced) {
      if (row.kind !== "turno" || row.actualSec !== undefined) continue;
      const driver = capped.find((d) => d.id === row.driverId);
      const cap = Math.min(driver?.maxStintSec ?? RULES.maxStintSec, RULES.maxStintSec);
      expect(row.targetSec).toBeLessThanOrEqual(cap);
    }
  });

  it("is a no-op once every turno is completed or locked", () => {
    const { schedule } = setup();
    const allDone = schedule.map((r) =>
      r.kind === "turno" ? { ...r, actualSec: r.targetSec, locked: true } : r,
    );
    const rebalanced = rebalanceSchedule(allDone, ds, RULES.raceDurationSec);
    expect(rebalanced).toEqual(allDone);
  });

  it("adds extra turno+box rows when pending capacity is insufficient to fill remaining time", () => {
    // Corrida curta (3h) com pilotos limitados a 10 min, para forçar a situação
    // em que a capacidade dos turnos pendentes não chega para preencher o tempo restante.
    const shortDs: Driver[] = [
      { id: "x", name: "X", maxStintSec: 10 * 60 },
      { id: "y", name: "Y", maxStintSec: 10 * 60 },
    ];
    const shortRace = 3 * 3600; // 3h
    // GREEN_TIME = 3h - 10 pits*4min = 10800 - 2400 = 8400s
    // 11 turnos × 10min = 6600s < 8400s → computeStintPlan daria erro, por isso
    // construímos o schedule manualmente com apenas 2 turnos pendentes.
    const twoTurnoSchedule: ScheduleRow[] = [
      {
        id: "turno-1",
        kind: "turno",
        label: "Turno 1",
        stintIndex: 0,
        driverId: "x",
        driverName: "X",
        targetSec: 600,
        etaInMs: 0,
        etaOutMs: 0,
        actualSec: 60, // concluído com 60s (underrun massivo de -540s)
        actualOutMs: 60_000,
      },
      {
        id: "box-1",
        kind: "box",
        label: "BOX 1",
        stintIndex: 0,
        targetSec: RULES.pitMinSec,
        etaInMs: 0,
        etaOutMs: 0,
        actualSec: RULES.pitMinSec,
        actualOutMs: 60_000 + RULES.pitMinSec * 1000,
      },
      {
        id: "turno-2",
        kind: "turno",
        label: "Turno 2",
        stintIndex: 1,
        driverId: "y",
        driverName: "Y",
        targetSec: 600,
        etaInMs: 0,
        etaOutMs: 0,
      },
    ];
    // remaining = 8400 - 60 = 8340s, pending cap = 600s → precisa de stints extra
    const rebalanced = rebalanceSchedule(twoTurnoSchedule, shortDs, shortRace);

    const turnos = rebalanced.filter((r) => r.kind === "turno");
    const pending = turnos.filter((r) => r.actualSec === undefined);
    expect(pending.length).toBeGreaterThan(1); // adicionou stints
    // A soma dos targets pendentes + actualSec do turno concluído deve cobrir o tempo de pista,
    // descontando o custo das boxes extra.
    const boxes = rebalanced.filter((r) => r.kind === "box" && r.actualSec === undefined);
    const pendingTargetSum = pending.reduce((a, r) => a + r.targetSec, 0);
    const extraPitCost = boxes.length * RULES.pitMinSec;
    expect(60 + pendingTargetSum + extraPitCost).toBeLessThanOrEqual(shortRace + 1); // dentro do orçamento
  });
});

describe("suggestBallast", () => {
  it("suggests no ballast for drivers at or above the minimum weight", () => {
    expect(suggestBallast(drivers("Ana")).length).toBe(0);
    const ds = drivers("Ana");
    ds[0].weightKg = RULES.minDriverWeightKg;
    expect(suggestBallast(ds).length).toBe(0);
  });

  it("suggests exact weights when they divide evenly", () => {
    const ds = drivers("Ana");
    ds[0].weightKg = 70; // faltam 10kg
    const [s] = suggestBallast(ds);
    expect(s.missingKg).toBe(10);
    expect(s.weightsKg).toEqual([10]);
  });

  it("rounds up when the remainder is smaller than the smallest ballast", () => {
    const ds = drivers("Ana");
    ds[0].weightKg = 79; // falta 1kg, menor lastro é 2.5kg
    const [s] = suggestBallast(ds);
    expect(s.missingKg).toBe(1);
    expect(s.weightsKg).toEqual([2.5]);
  });
});
