import { describe, expect, it } from "vitest";
import { ApexParser } from "./parser.js";

const GRID = [
  '<tr id="r1">',
  '<td data-type="no">5</td>',
  '<td data-type="dr">Equipa A</td>',
  '<td data-type="llp">0:45.123</td>',
  '<td data-type="blp">0:44.900</td>',
  '<td data-type="gap">-</td>',
  '<td data-type="tlp">12</td>',
  "</tr>",
  '<tr id="r2">',
  '<td data-type="no">7</td>',
  '<td data-type="dr">Equipa B</td>',
  '<td data-type="llp">0:45.500</td>',
  '<td data-type="blp">0:45.100</td>',
  '<td data-type="gap">+1.2</td>',
  '<td data-type="tlp">12</td>',
  "</tr>",
].join("");

describe("ApexParser", () => {
  it("parses init|*| as the session type", () => {
    const parser = new ApexParser();
    const snapshot = parser.feed("init|r|");
    expect(snapshot.sessionType).toBe("r");
  });

  it("parses grid||<html> into a normalized kart list, in row order", () => {
    const parser = new ApexParser();
    const snapshot = parser.feed(`grid||${GRID}`);

    expect(snapshot.karts).toHaveLength(2);
    expect(snapshot.karts[0]).toMatchObject({
      no: "5",
      name: "Equipa A",
      pos: 1,
      lastLap: "0:45.123",
      bestLap: "0:44.900",
      gap: "-",
      laps: "12",
    });
    expect(snapshot.karts[1]).toMatchObject({ no: "7", name: "Equipa B", pos: 2 });
  });

  it("applies rNcM|*|<valor> incremental cell updates, stripping HTML", () => {
    const parser = new ApexParser();
    parser.feed(`grid||${GRID}`);

    // Coluna 2 (índice 0-based) da linha r1 = "llp" (última volta).
    const snapshot = parser.feed('r1c2|*|<span class="best">0:44.800</span>');

    expect(snapshot.karts[0].lastLap).toBe("0:44.800");
    // Outros campos da linha mantêm-se.
    expect(snapshot.karts[0].no).toBe("5");
    expect(snapshot.karts[0].bestLap).toBe("0:44.900");
  });

  it("ignores updates for unknown rows or columns", () => {
    const parser = new ApexParser();
    parser.feed(`grid||${GRID}`);

    const before = parser.snapshot();
    const after = parser.feed("r9c2|*|<span>99:99</span>");
    expect(after.karts).toEqual(before.karts);
  });

  it("processes multiple lines in a single message", () => {
    const parser = new ApexParser();
    const snapshot = parser.feed(`init|r|\ngrid||${GRID}\nr2c2|*|0:45.000`);

    expect(snapshot.sessionType).toBe("r");
    expect(snapshot.karts[1].lastLap).toBe("0:45.000");
  });
});
