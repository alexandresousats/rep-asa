import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toISODate } from "@/lib/dates";
import { heatmapInterval, heatmapYearInterval } from "@/lib/heatmap-window";
import { Heatmap } from "./heatmap";

test("a janela rolante mostra cada mês e nenhum buraco", () => {
  const cells = heatmapInterval(new Date(2026, 10, 5)).map((day) => ({
    date: toISODate(day),
    count: 0,
  }));
  const html = renderToStaticMarkup(createElement(Heatmap, { cells }));

  for (const month of ["nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out"]) {
    assert.match(html, new RegExp(`>${month}<`));
  }

  assert.match(html, /5 nov\.? 2026 · 0 entregas/);
  assert.doesNotMatch(html, /dez\.? 2026/);
  assert.equal(html.match(/bg-transparent/g), null);
  assert.match(html, /aspect-ratio:\s*53 \/ 7/);
});

test("ano passado continua de janeiro a dezembro, com a grade cheia", () => {
  const cells = heatmapYearInterval(2025).map((day) => ({
    date: toISODate(day),
    count: day.getMonth() === 0 && day.getDate() === 2 ? 1 : 0,
  }));
  const html = renderToStaticMarkup(createElement(Heatmap, { cells, year: 2025 }));

  for (const month of ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]) {
    assert.match(html, new RegExp(`>${month}<`));
  }
  assert.match(html, /2 jan\.? 2025 · 1 entrega/);
  assert.equal(html.match(/bg-transparent/g), null);
});
