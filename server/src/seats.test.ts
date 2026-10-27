import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cheapestSeats,
  describeSeatQuote,
  mixFits,
  planTotal,
  seatCapacity,
  seatsFromAddons,
} from "./seats";

const MONTHLY_TOTALS: Record<number, number> = {
  6: 1290,
  8: 1890,
  9: 1980,
  10: 1980,
  12: 2580,
  13: 2880,
  14: 2970,
  15: 2970,
};

test("a opção mais barata bate com a tabela de 6 a 15 pessoas", () => {
  for (const [people, total] of Object.entries(MONTHLY_TOTALS)) {
    const mix = cheapestSeats(Number(people));
    assert.equal(planTotal("month", mix), total, `${people} pessoas`);
    assert.equal(mixFits(Number(people), mix), true);
  }
});

test("quatro ou mais extras sugerem o combo", () => {
  assert.deepEqual(cheapestSeats(8), { extraSeats: 3, seatPacks: 0 });
  assert.deepEqual(cheapestSeats(9), { extraSeats: 0, seatPacks: 1 });
  assert.deepEqual(cheapestSeats(14), { extraSeats: 0, seatPacks: 2 });
  assert.deepEqual(cheapestSeats(15), { extraSeats: 0, seatPacks: 2 });
});

test("trimestral usa a mesma combinação com os preços de 5%", () => {
  const nine = cheapestSeats(9, "quarter");
  assert.deepEqual(nine, { extraSeats: 0, seatPacks: 1 });
  assert.equal(planTotal("quarter", nine), 2822 + 2822);
  const six = cheapestSeats(6, "quarter");
  assert.equal(planTotal("quarter", six), 2822 + 855);
});

test("capacidade não passa de 15", () => {
  assert.equal(seatCapacity(10, 0), 15);
  assert.equal(mixFits(15, { extraSeats: 10, seatPacks: 0 }), true);
  assert.equal(mixFits(15, { extraSeats: 1, seatPacks: 2 }), false);
  assert.throws(() => cheapestSeats(16), /15/);
});

test("addons viram avulsos e combos separados", () => {
  const mix = seatsFromAddons(
    [
      { addon_id: "seat", quantity: 2 },
      { addon_id: "pack", quantity: 1 },
      { addon_id: "outro", quantity: 4 },
    ],
    { singles: ["seat"], packs: ["pack"] },
  );
  assert.deepEqual(mix, { extraSeats: 2, seatPacks: 1 });
  assert.equal(seatCapacity(mix.extraSeats, mix.seatPacks), 12);
});

test("convite acima da capacidade sugere a compra e o de 16 pessoas bloqueia", () => {
  const grow = describeSeatQuote({
    people: 8,
    alreadyCounted: false,
    period: "month",
    mix: { extraSeats: 3, seatPacks: 0 },
  });
  assert.equal(grow.needsPurchase, true);
  assert.equal(grow.blocked, false);
  assert.deepEqual(
    grow.suggestion && { extraSeats: grow.suggestion.extraSeats, seatPacks: grow.suggestion.seatPacks },
    { extraSeats: 0, seatPacks: 1 },
  );
  assert.match(grow.message, /combo/);

  const full = describeSeatQuote({
    people: 15,
    alreadyCounted: false,
    period: "month",
    mix: { extraSeats: 0, seatPacks: 2 },
  });
  assert.equal(full.blocked, true);
  assert.equal(full.needsPurchase, false);
  assert.match(full.message, /15/);
});
