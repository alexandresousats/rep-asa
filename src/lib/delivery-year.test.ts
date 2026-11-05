import assert from "node:assert/strict";
import test from "node:test";
import { deliverySnapshot, deliveryYears } from "./insights";
import type { Task } from "./types";

function done(id: string, completedAt: string): Task {
  return { id, status: "done", completedAt } as Task;
}

test("deliveryYears inclui o ano atual e os anos com entrega", () => {
  const years = deliveryYears(
    [done("a", "2024-03-01"), done("b", "2024-03-02"), done("c", "2026-01-10")],
    new Date(2026, 10, 5),
  );
  assert.deepEqual(years, [2026, 2024]);
});

test("deliverySnapshot conta só o ano escolhido", () => {
  const tasks = [
    done("a", "2025-01-02"),
    done("b", "2025-01-03"),
    done("c", "2026-11-01"),
  ];
  const snapshot = deliverySnapshot(tasks, 2025, new Date(2026, 10, 5));
  assert.equal(snapshot.totalCompleted, 2);
  assert.equal(snapshot.longestStreak, 2);
  assert.ok(snapshot.heatmap.some((cell) => cell.date === "2025-01-02" && cell.count === 1));
  assert.ok(snapshot.heatmap.every((cell) => cell.date.startsWith("2024-") || cell.date.startsWith("2025-") || cell.date.startsWith("2026-")));
  assert.equal(snapshot.heatmap.find((cell) => cell.date === "2024-12-31")?.count, 0);
});
