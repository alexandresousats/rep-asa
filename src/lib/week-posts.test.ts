import assert from "node:assert/strict";
import test from "node:test";
import { tasksLeavingThisWeek } from "./week-posts";

const wednesday = new Date(2026, 9, 28);

test("a subtarefa com vencimento na semana entra na visão geral", () => {
  const tasks = tasksLeavingThisWeek(
    [
      { id: "pai", parentId: null, status: "todo", dueDate: "2026-11-02" },
      { id: "filha", parentId: "pai", status: "todo", dueDate: "2026-10-29" },
      { id: "feita", parentId: "pai", status: "done", dueDate: "2026-10-28" },
      { id: "hist-1", parentId: null, status: "todo", dueDate: "2026-10-28" },
    ],
    wednesday,
  );
  assert.deepEqual(
    tasks.map((task) => task.id),
    ["filha"],
  );
});
