import { RULES, STINT_COUNT, greenTimeSec } from "./rules.js";
import type {
  BallastSuggestion,
  Driver,
  RaceConfig,
  ScheduleRow,
  StintPlan,
  StrategyError,
  StrategyResult,
} from "./types.js";

/**
 * Distribui `total` por `caps.length` "slots", respeitando o limite de cada slot
 * (water-filling): slots com capacidade <= à parte igual recebem a sua capacidade
 * total, e o restante é repartido igualmente pelos slots ainda não saturados.
 */
function waterFill(caps: number[], total: number): number[] {
  const n = caps.length;
  const result = new Array<number>(n).fill(0);
  const active = new Set(caps.map((_, i) => i));
  let remaining = total;

  while (active.size > 0) {
    const share = remaining / active.size;
    let cappedAny = false;
    for (const i of [...active]) {
      if (caps[i] <= share) {
        result[i] = caps[i];
        remaining -= caps[i];
        active.delete(i);
        cappedAny = true;
      }
    }
    if (!cappedAny) {
      for (const i of active) result[i] = share;
      break;
    }
  }
  return result;
}

/**
 * Devolve uma sequência de `STINT_COUNT` índices de piloto, dado quantos stints
 * cada piloto deve receber (`slotsPerDriver`), intercalando os pilotos em vez de
 * agrupar os stints de um mesmo piloto consecutivamente.
 */
function interleave(slotsPerDriver: number[]): number[] {
  const remaining = [...slotsPerDriver];
  const total = remaining.reduce((a, b) => a + b, 0);
  const sequence: number[] = [];
  while (sequence.length < total) {
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] > 0) {
        sequence.push(i);
        remaining[i]--;
      }
    }
  }
  return sequence;
}

/**
 * Calcula o plano de stints (distribuição dos 11 turnos pelos pilotos) que usa
 * todo o tempo de pista disponível (`GREEN_TIME_SEC`), respeitando o máximo de
 * cada piloto e garantindo que todos conduzem pelo menos um turno (§8f).
 */
export function computeStintPlan(
  drivers: Driver[],
  raceDurationSec: number = RULES.raceDurationSec,
): StintPlan[] | StrategyError {
  const n = drivers.length;
  if (n < RULES.minDrivers || n > RULES.maxDrivers) {
    return {
      error: `Número de pilotos inválido (${n}). Tem de estar entre ${RULES.minDrivers} e ${RULES.maxDrivers}.`,
    };
  }
  if (!Number.isFinite(raceDurationSec) || raceDurationSec <= 0) {
    return { error: "Duração da prova inválida." };
  }

  const GREEN_TIME_SEC = greenTimeSec(raceDurationSec);

  const caps = drivers.map((d) =>
    Math.min(d.maxStintSec ?? RULES.maxStintSec, RULES.maxStintSec),
  );
  if (caps.some((c) => c <= 0)) {
    return { error: "O tempo máximo de stint de cada piloto tem de ser positivo." };
  }

  // Cada piloto recebe pelo menos 1 stint; os stints extra vão para o piloto
  // com maior capacidade até cobrirem o tempo de pista total, e os restantes
  // são distribuídos de forma rotativa para variar a ordem dos pilotos.
  const slotsPerDriver = caps.map(() => 1);
  let sum = caps.reduce((a, b) => a + b, 0);
  let extra = STINT_COUNT - n;
  const bestIdx = caps.indexOf(Math.max(...caps));

  while (extra > 0 && sum < GREEN_TIME_SEC) {
    slotsPerDriver[bestIdx] += 1;
    sum += caps[bestIdx];
    extra -= 1;
  }
  let rr = 0;
  while (extra > 0) {
    slotsPerDriver[rr % n] += 1;
    sum += caps[rr % n];
    rr += 1;
    extra -= 1;
  }

  if (sum < GREEN_TIME_SEC) {
    return {
      error:
        "Não é possível cobrir o tempo de corrida com os tempos máximos definidos. " +
        "Aumenta o máximo de stint de pelo menos um piloto.",
    };
  }

  const sequence = interleave(slotsPerDriver);
  const slotCaps = sequence.map((driverIdx) => caps[driverIdx]);
  const rawDurations = waterFill(slotCaps, GREEN_TIME_SEC);

  // Arredonda para segundos inteiros, ajustando o último stint para que a
  // soma continue a ser exatamente GREEN_TIME_SEC.
  const durations = rawDurations.map((d) => Math.round(d));
  const diff = GREEN_TIME_SEC - durations.reduce((a, b) => a + b, 0);
  durations[durations.length - 1] += diff;

  return sequence.map((driverIdx, i) => ({
    index: i,
    driverId: drivers[driverIdx].id,
    driverName: drivers[driverIdx].name,
    plannedDurationSec: durations[i],
  }));
}

/**
 * Constrói as linhas do cronograma (turnos + boxes) a partir do plano de stints,
 * com `etaInMs`/`etaOutMs` relativos a 0 — recalculados com o instante real de
 * início pela `recalculateSchedule`.
 */
export function buildSchedule(plan: StintPlan[]): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const stint of plan) {
    rows.push({
      id: `turno-${stint.index + 1}`,
      kind: "turno",
      label: `Turno ${stint.index + 1}`,
      stintIndex: stint.index,
      driverId: stint.driverId,
      driverName: stint.driverName,
      targetSec: stint.plannedDurationSec,
      etaInMs: 0,
      etaOutMs: 0,
    });
    if (stint.index < plan.length - 1) {
      rows.push({
        id: `box-${stint.index + 1}`,
        kind: "box",
        label: `BOX ${stint.index + 1}`,
        stintIndex: stint.index,
        targetSec: RULES.pitMinSec,
        etaInMs: 0,
        etaOutMs: 0,
      });
    }
  }
  return recalculateSchedule(rows, 0);
}

/**
 * Recalcula a cascata do cronograma (estilo Excel): a previsão de entrada de
 * cada linha é a saída real da linha anterior (se já existir) ou a sua previsão
 * de saída; a previsão de saída é a entrada + alvo; o delta é tempo real - alvo.
 */
export function recalculateSchedule(
  rows: ScheduleRow[],
  raceStartAt: number,
): ScheduleRow[] {
  let cursorMs = raceStartAt;
  return rows.map((row) => {
    const etaInMs = cursorMs;
    const etaOutMs = etaInMs + row.targetSec * 1000;
    const deltaSec =
      row.actualSec !== undefined ? row.actualSec - row.targetSec : undefined;
    cursorMs = row.actualOutMs ?? etaOutMs;
    return { ...row, etaInMs, etaOutMs, deltaSec };
  });
}

/**
 * Sugere uma combinação de lastros (2,5/5/10kg) para cada piloto abaixo do peso
 * mínimo regulamentar (§10), de forma a atingir pelo menos 80kg.
 */
export function suggestBallast(drivers: Driver[]): BallastSuggestion[] {
  const suggestions: BallastSuggestion[] = [];
  for (const driver of drivers) {
    if (driver.weightKg === undefined) continue;
    if (driver.weightKg >= RULES.minDriverWeightKg) continue;

    const missingKg = RULES.minDriverWeightKg - driver.weightKg;
    const weightsKg: number[] = [];
    let remaining = missingKg;
    for (const w of RULES.ballastWeightsKg) {
      while (remaining >= w) {
        weightsKg.push(w);
        remaining -= w;
      }
    }
    if (remaining > 0) {
      // Sobra menor que o lastro mais pequeno: arredonda para cima.
      weightsKg.push(RULES.ballastWeightsKg[RULES.ballastWeightsKg.length - 1]);
    }

    suggestions.push({ driverId: driver.id, driverName: driver.name, missingKg, weightsKg });
  }
  return suggestions;
}

/**
 * Calcula o resultado completo da estratégia: plano de stints, cronograma e
 * sugestões de lastro.
 */
export function computeStrategy(config: RaceConfig): StrategyResult | StrategyError {
  const plan = computeStintPlan(config.drivers, config.raceDurationSec ?? RULES.raceDurationSec);
  if ("error" in plan) return plan;

  return {
    plan,
    schedule: buildSchedule(plan),
    ballast: suggestBallast(config.drivers),
  };
}

/** Edição de um turno: novo piloto e/ou novo tempo alvo (em segundos). */
export interface ScheduleEdit {
  driverId?: string;
  targetSec?: number;
}

/**
 * Aplica a edição de um turno (piloto e/ou alvo) ao plano e ao cronograma.
 *
 * Só é possível editar linhas "turno" que ainda não tenham `actualSec`
 * (i.e. ainda não concluídas). A cascata de `etaInMs`/`etaOutMs` das linhas
 * seguintes (e o respetivo delta) é recalculada a partir daqui pelo chamador
 * via `recalculateSchedule`.
 */
export function applyScheduleEdit(
  schedule: ScheduleRow[],
  plan: StintPlan[],
  drivers: Driver[],
  rowId: string,
  edit: ScheduleEdit,
): { schedule: ScheduleRow[]; plan: StintPlan[] } | StrategyError {
  const idx = schedule.findIndex((r) => r.id === rowId);
  if (idx === -1) {
    return { error: `Linha "${rowId}" não encontrada.` };
  }

  const row = schedule[idx];
  if (row.kind !== "turno") {
    return { error: "Só é possível editar turnos (linhas \"turno\")." };
  }
  if (row.actualSec !== undefined) {
    return { error: "Não é possível editar um turno já concluído." };
  }

  let driverId = row.driverId;
  let driverName = row.driverName;
  if (edit.driverId !== undefined) {
    const driver = drivers.find((d) => d.id === edit.driverId);
    if (!driver) {
      return { error: "Piloto inválido." };
    }
    driverId = driver.id;
    driverName = driver.name;
  }

  let targetSec = row.targetSec;
  if (edit.targetSec !== undefined) {
    if (!Number.isFinite(edit.targetSec) || edit.targetSec <= 0) {
      return { error: "Tempo alvo inválido." };
    }
    targetSec = Math.round(edit.targetSec);
  }

  const updatedRow: ScheduleRow = {
    ...row,
    driverId,
    driverName,
    targetSec,
    // Um alvo definido manualmente fica "fixo": não é tocado pela
    // redistribuição automática em `rebalanceSchedule`.
    locked: edit.targetSec !== undefined ? true : row.locked,
  };
  const newSchedule = schedule.map((r, i) => (i === idx ? updatedRow : r));
  const newPlan = plan.map((stint) =>
    stint.index === row.stintIndex
      ? {
          ...stint,
          driverId: driverId ?? stint.driverId,
          driverName: driverName ?? stint.driverName,
          plannedDurationSec: targetSec,
        }
      : stint,
  );

  return { schedule: newSchedule, plan: newPlan };
}

/**
 * Redistribui o tempo alvo (`targetSec`) dos turnos ainda pendentes (sem
 * `actualSec` e não marcados como `locked`), de forma a que a soma de todos
 * os alvos volte a ser igual ao tempo de pista total (`greenTimeSec`).
 *
 * Isto faz com que o delta acumulado nos turnos já concluídos (real - alvo)
 * seja absorvido pelos turnos seguintes: se um turno demorou mais do que o
 * previsto, os turnos pendentes ficam com menos tempo (e vice-versa),
 * respeitando sempre o `maxStintSec` de cada piloto.
 *
 * Turnos concluídos (`actualSec` definido) e turnos com alvo fixado
 * manualmente (`locked`) não são alterados — o respetivo tempo é subtraído
 * do total disponível antes de repartir o resto pelos restantes.
 */
export function rebalanceSchedule(
  schedule: ScheduleRow[],
  drivers: Driver[],
  raceDurationSec: number,
): ScheduleRow[] {
  if (drivers.length === 0) return schedule;

  const greenTime = greenTimeSec(raceDurationSec);

  const driverCap = (driverId: string | undefined): number => {
    const driver = drivers.find((d) => d.id === driverId);
    return Math.min(driver?.maxStintSec ?? RULES.maxStintSec, RULES.maxStintSec);
  };

  let usedSec = 0;
  const pendingIdx: number[] = [];
  let currentSchedule = [...schedule];

  for (let i = 0; i < currentSchedule.length; i++) {
    const row = currentSchedule[i];
    if (row.kind !== "turno") continue;
    if (row.actualSec !== undefined || row.locked) {
      usedSec += row.actualSec ?? row.targetSec;
    } else {
      pendingIdx.push(i);
    }
  }

  if (pendingIdx.length === 0) return schedule;

  const remaining = Math.max(0, greenTime - usedSec);
  const pendingCaps = pendingIdx.map((i) => driverCap(currentSchedule[i].driverId));

  // Se a capacidade total dos turnos pendentes não chega para preencher o
  // tempo de pista restante, adicionamos mais turnos (+ respectivas boxes).
  // Cada box extra custa RULES.pitMinSec, reduzindo o tempo de pista efetivo.
  let extraPits = 0;
  let capSum = pendingCaps.reduce((a, b) => a + b, 0);

  const lastPendingRow = currentSchedule[pendingIdx[pendingIdx.length - 1]];
  const lastDriverIdx = drivers.findIndex((d) => d.id === lastPendingRow.driverId);
  let nextDriverIdx = (lastDriverIdx < 0 ? 0 : lastDriverIdx + 1) % drivers.length;
  let nextStintIdx = Math.max(...currentSchedule.map((r) => r.stintIndex)) + 1;

  while (remaining - (extraPits + 1) * RULES.pitMinSec > capSum) {
    const effectiveAfterNewPit = remaining - (extraPits + 1) * RULES.pitMinSec;
    if (effectiveAfterNewPit <= 0) break;

    extraPits++;

    // Adiciona box para o turno que até agora era o último (sem box).
    const prevStintIdx = nextStintIdx - 1;
    const hasBox = currentSchedule.some(
      (r) => r.kind === "box" && r.stintIndex === prevStintIdx,
    );
    if (!hasBox) {
      currentSchedule.push({
        id: `box-${prevStintIdx + 1}`,
        kind: "box",
        label: `BOX ${prevStintIdx + 1}`,
        stintIndex: prevStintIdx,
        targetSec: RULES.pitMinSec,
        etaInMs: 0,
        etaOutMs: 0,
      });
    }

    // Adiciona o novo turno.
    const driver = drivers[nextDriverIdx];
    const cap = driverCap(driver.id);
    pendingIdx.push(currentSchedule.length);
    pendingCaps.push(cap);
    capSum += cap;
    currentSchedule.push({
      id: `turno-${nextStintIdx + 1}`,
      kind: "turno",
      label: `Turno ${nextStintIdx + 1}`,
      stintIndex: nextStintIdx,
      driverId: driver.id,
      driverName: driver.name,
      targetSec: cap,
      etaInMs: 0,
      etaOutMs: 0,
    });

    nextDriverIdx = (nextDriverIdx + 1) % drivers.length;
    nextStintIdx++;
  }

  const trackToDistribute = Math.max(0, remaining - extraPits * RULES.pitMinSec);
  const rawDurations = waterFill(pendingCaps, trackToDistribute);

  const durations = rawDurations.map((d) => Math.max(0, Math.round(d)));
  const diff = trackToDistribute - durations.reduce((a, b) => a + b, 0);
  durations[durations.length - 1] = Math.max(0, durations[durations.length - 1] + diff);

  return currentSchedule.map((row, i) => {
    const pos = pendingIdx.indexOf(i);
    return pos === -1 ? row : { ...row, targetSec: durations[pos] };
  });
}

/**
 * Reconstrói o `plan` a partir das linhas "turno" do `schedule`. Novos turnos
 * adicionados por `rebalanceSchedule` são incluídos automaticamente; turnos
 * removidos desaparecem. Os dados do plano original são preservados nos campos
 * que o `schedule` não sobrepõe (apenas `driverId`/`driverName`/`plannedDurationSec`
 * são derivados do `schedule`).
 */
export function syncPlanWithSchedule(plan: StintPlan[], schedule: ScheduleRow[]): StintPlan[] {
  return schedule
    .filter((r) => r.kind === "turno")
    .map((r) => {
      const existing = plan.find((p) => p.index === r.stintIndex);
      return {
        index: r.stintIndex,
        driverId: r.driverId ?? existing?.driverId ?? "",
        driverName: r.driverName ?? existing?.driverName ?? "",
        plannedDurationSec: r.targetSec,
      };
    });
}
