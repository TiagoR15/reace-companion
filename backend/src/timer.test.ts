import { describe, expect, it } from "vitest";
import { computeStintPlan, buildSchedule, recalculateSchedule } from "./strategy.js";
import { RULES, STINT_COUNT } from "./rules.js";
import {
  createInitialTimerState,
  elapsedRaceSec,
  elapsedStintSec,
  pitIn,
  pitRemainingSec,
  startRace,
  tick,
} from "./timer.js";
import type { Driver, ScheduleRow, StintPlan, TimerState } from "./types.js";

const drivers: Driver[] = [
  { id: "d0", name: "Ana" },
  { id: "d1", name: "Bruno" },
  { id: "d2", name: "Carla" },
];

function setup(): { plan: StintPlan[]; schedule: ScheduleRow[] } {
  const plan = computeStintPlan(drivers) as StintPlan[];
  return { plan, schedule: buildSchedule(plan) };
}

const T0 = Date.UTC(2026, 5, 13, 10, 30, 0);

describe("timer state machine", () => {
  it("starts idle", () => {
    const timer = createInitialTimerState();
    expect(timer.phase).toBe("idle");
  });

  it("startRace begins the global clock and stint 0", () => {
    let timer = createInitialTimerState();
    timer = startRace(timer, T0);
    expect(timer.phase).toBe("running");
    expect(timer.sub).toBe("onTrack");
    expect(timer.raceStartAt).toBe(T0);
    expect(timer.stintStartedAt).toBe(T0);
    expect(timer.currentStintIndex).toBe(0);
  });

  it("startRace is a no-op once running", () => {
    let timer = startRace(createInitialTimerState(), T0);
    const again = startRace(timer, T0 + 5000);
    expect(again).toEqual(timer);
  });

  it("pitIn closes the current turno row and starts the 4min pit countdown", () => {
    const { schedule } = setup();
    let timer = startRace(createInitialTimerState(), T0);

    const stintDurationMs = 30 * 60 * 1000;
    const pitAt = T0 + stintDurationMs;
    const result = pitIn(timer, schedule, pitAt);

    expect(result.timer.sub).toBe("inPit");
    expect(result.timer.pitEndsAt).toBe(pitAt + RULES.pitMinSec * 1000);

    const turno1 = result.schedule.find((r) => r.id === "turno-1")!;
    expect(turno1.actualSec).toBe(30 * 60);
    expect(turno1.actualOutMs).toBe(pitAt);
  });

  it("pitIn is a no-op while already in pit or idle", () => {
    const { schedule } = setup();
    const idle = createInitialTimerState();
    expect(pitIn(idle, schedule, T0).timer).toEqual(idle);

    let timer = startRace(createInitialTimerState(), T0);
    const afterPit = pitIn(timer, schedule, T0 + 1000).timer;
    const again = pitIn(afterPit, schedule, T0 + 2000);
    expect(again.timer).toEqual(afterPit);
  });

  it("tick does nothing before the 4min pit window ends", () => {
    const { schedule } = setup();
    let timer = startRace(createInitialTimerState(), T0);
    const pitResult = pitIn(timer, schedule, T0 + 1000);

    const before = tick(pitResult.timer, pitResult.schedule, pitResult.timer.pitEndsAt! - 1);
    expect(before.timer.sub).toBe("inPit");
    expect(before.timer.currentStintIndex).toBe(0);
  });

  it("tick auto-advances to the next driver once 4min of pit have passed", () => {
    const { schedule } = setup();
    let timer = startRace(createInitialTimerState(), T0);
    const pitResult = pitIn(timer, schedule, T0 + 1000);

    const after = tick(pitResult.timer, pitResult.schedule, pitResult.timer.pitEndsAt!);
    expect(after.timer.sub).toBe("onTrack");
    expect(after.timer.currentStintIndex).toBe(1);
    expect(after.timer.stopsDone).toBe(1);
    expect(after.timer.stintStartedAt).toBe(pitResult.timer.pitEndsAt);
    expect(after.timer.pitEndsAt).toBeNull();

    const box1 = after.schedule.find((r) => r.id === "box-1")!;
    expect(box1.actualSec).toBe(RULES.pitMinSec);
  });

  it("after the 10th pit stop, the driver is on the 11th (final) stint", () => {
    const { schedule: initialSchedule } = setup();
    let timer = startRace(createInitialTimerState(), T0);
    let schedule = initialSchedule;
    let now = T0;

    for (let stop = 1; stop <= RULES.mandatoryStops; stop++) {
      now += 20 * 60 * 1000; // 20 min de stint
      const pitResult = pitIn(timer, schedule, now);
      timer = pitResult.timer;
      schedule = pitResult.schedule;

      now = timer.pitEndsAt!;
      const tickResult = tick(timer, schedule, now);
      timer = tickResult.timer;
      schedule = tickResult.schedule;

      expect(timer.phase).toBe("running");
      expect(timer.currentStintIndex).toBe(stop);
    }

    // 11 stints (índices 0..10), 10 paragens feitas; sem mais boxes — a
    // corrida termina por chegar às 7h do cronómetro global.
    expect(timer.currentStintIndex).toBe(STINT_COUNT - 1);
    expect(timer.stopsDone).toBe(RULES.mandatoryStops);
    expect(timer.sub).toBe("onTrack");
  });

  it("finishes when the global 7h clock elapses, even mid-stint", () => {
    let timer = startRace(createInitialTimerState(), T0);
    const { schedule } = setup();

    const result = tick(timer, schedule, T0 + RULES.raceDurationSec * 1000);
    expect(result.timer.phase).toBe("finished");
  });
});

describe("derived elapsed/remaining helpers", () => {
  it("computes elapsed race / stint / pit-remaining seconds", () => {
    const { schedule } = setup();
    let timer = startRace(createInitialTimerState(), T0);

    expect(elapsedRaceSec(timer, T0 + 90_000)).toBe(90);
    expect(elapsedStintSec(timer, T0 + 90_000)).toBe(90);

    const pitResult = pitIn(timer, schedule, T0 + 90_000);
    expect(elapsedStintSec(pitResult.timer, T0 + 100_000)).toBe(0);
    expect(pitRemainingSec(pitResult.timer, T0 + 90_000)).toBe(RULES.pitMinSec);
    expect(pitRemainingSec(pitResult.timer, T0 + 90_000 + 60_000)).toBe(
      RULES.pitMinSec - 60,
    );
  });
});
