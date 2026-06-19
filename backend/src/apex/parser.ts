import * as cheerio from "cheerio";
import type { Kart, LiveSnapshot } from "../types.js";

/** Colunas da grelha que nos interessam, por valor de `data-type`. */
const KART_FIELDS = ["no", "dr", "llp", "blp", "gap", "tlp"] as const;
type KartField = (typeof KART_FIELDS)[number];

function stripHtml(html: string): string {
  return cheerio.load(`<div>${html}</div>`)("div").text().trim();
}

/**
 * Parser incremental do protocolo da Apex Timing: linhas `campo|chave|valor`.
 * Mantém o estado normalizado da grelha (`LiveSnapshot`) e vai-o atualizando
 * com `grid||<html>` (snapshot completo) e `rNcM|*|<valor>` (updates de célula).
 */
export class ApexParser {
  private sessionType: string | null = null;
  /** Para cada linha (rowId), o campo correspondente a cada índice de coluna. */
  private columnsByRow = new Map<string, (KartField | null)[]>();
  /** Dados normalizados de cada linha, por rowId. */
  private rows = new Map<string, Partial<Record<KartField, string>>>();
  /** Ordem das linhas tal como aparecem na grelha (= ordem de posição). */
  private rowOrder: string[] = [];

  /** Processa uma mensagem (pode conter várias linhas separadas por `\n`). */
  feed(raw: string): LiveSnapshot {
    for (const line of raw.split("\n")) {
      this.handleLine(line.trim());
    }
    return this.snapshot();
  }

  private handleLine(line: string): void {
    if (!line) return;

    const firstPipe = line.indexOf("|");
    if (firstPipe === -1) return;
    const secondPipe = line.indexOf("|", firstPipe + 1);
    if (secondPipe === -1) return;

    const field = line.slice(0, firstPipe);
    const key = line.slice(firstPipe + 1, secondPipe);
    const value = line.slice(secondPipe + 1);

    if (field === "init") {
      this.sessionType = key || null;
      return;
    }

    if (field === "grid") {
      this.parseGrid(value);
      return;
    }

    const cellMatch = field.match(/^r(\d+)c(\d+)$/);
    if (cellMatch) {
      const rowId = `r${cellMatch[1]}`;
      const colIndex = Number(cellMatch[2]);
      this.updateCell(rowId, colIndex, value);
      return;
    }

    // css|*|..., title*/track/light/wthN/dyn*/gmt — metadados sem impacto na grelha.
  }

  private parseGrid(html: string): void {
    const $ = cheerio.load(`<table><tbody>${html}</tbody></table>`);
    const newOrder: string[] = [];

    $("tr").each((_, tr) => {
      const $tr = $(tr);
      const rowId = $tr.attr("id");
      if (!rowId) return;

      const fields: (KartField | null)[] = [];
      const data: Partial<Record<KartField, string>> = {};

      $tr.find("td,th").each((_, td) => {
        const $td = $(td);
        const type = $td.attr("data-type") as KartField | undefined;
        const field: KartField | null =
          type && (KART_FIELDS as readonly string[]).includes(type) ? type : null;
        fields.push(field);
        if (field) data[field] = $td.text().trim();
      });

      this.columnsByRow.set(rowId, fields);
      this.rows.set(rowId, data);
      newOrder.push(rowId);
    });

    if (newOrder.length > 0) this.rowOrder = newOrder;
  }

  private updateCell(rowId: string, colIndex: number, rawValue: string): void {
    const fields = this.columnsByRow.get(rowId);
    if (!fields) return;
    const field = fields[colIndex];
    if (!field) return;

    const row = this.rows.get(rowId) ?? {};
    row[field] = stripHtml(rawValue);
    this.rows.set(rowId, row);

    if (!this.rowOrder.includes(rowId)) this.rowOrder.push(rowId);
  }

  snapshot(): LiveSnapshot {
    const karts: Kart[] = this.rowOrder.map((rowId, i) => {
      const row = this.rows.get(rowId) ?? {};
      return {
        no: row.no ?? "",
        name: row.dr ?? "",
        pos: i + 1,
        lastLap: row.llp,
        bestLap: row.blp,
        gap: row.gap,
        laps: row.tlp,
      };
    });

    return { sessionType: this.sessionType, karts, updatedAt: Date.now() };
  }
}
