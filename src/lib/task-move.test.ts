import assert from "node:assert/strict";
import test from "node:test";
import {
  beforeIdForRow,
  moveWithinSection,
  planSectionTransfer,
  rootIdsInSection,
  sectionEdgeTarget,
  type MovableTask,
} from "./task-move";

const tasks: MovableTask[] = [
  { id: "a1", section: "Briefing", order: 0 },
  { id: "a1-child", section: "Briefing", parentId: "a1", order: 0 },
  { id: "a1-grand", section: "Briefing", parentId: "a1-child", order: 1 },
  { id: "a2", section: "Briefing", order: 1 },
  { id: "b1", section: "Produção", order: 0 },
  { id: "b2", section: "Produção", order: 1 },
  { id: "kept", section: "Produção", parentId: "b1", order: 0 },
];

test("root ids stay inside the section and follow the list order", () => {
  assert.deepEqual(rootIdsInSection(tasks, "Briefing"), ["a1", "a2"]);
  assert.deepEqual(rootIdsInSection(tasks, "Produção"), ["b1", "b2"]);
  assert.deepEqual(rootIdsInSection(tasks, "Arquivo"), []);
});

test("reordering inside a section keeps the previous slot behavior", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(moveWithinSection(ids, "a", "c"), ["b", "c", "a"]);
  assert.deepEqual(moveWithinSection(ids, "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(moveWithinSection(ids, "c", "b"), ["a", "c", "b"]);
  assert.deepEqual(moveWithinSection(ids, "a", "b"), ["b", "a", "c"]);
  assert.equal(moveWithinSection(ids, "a", "a"), null);
  assert.equal(moveWithinSection(ids, "c", null), null);
  assert.deepEqual(moveWithinSection(ids, "a", null), ["b", "c", "a"]);
});

test("moving onto another section inserts where the row was dropped", () => {
  const beforeSecond = planSectionTransfer(tasks, "a1", "Produção", "b2");
  assert.ok(beforeSecond);
  assert.equal(beforeSecond.section, "Produção");
  assert.equal(beforeSecond.order, 1);
  assert.deepEqual(beforeSecond.orderedIds, ["b1", "a1", "b2"]);
  assert.deepEqual(beforeSecond.childIds, ["a1-child", "a1-grand"]);

  const atStart = planSectionTransfer(tasks, "a2", "Produção", "b1");
  assert.deepEqual(atStart?.orderedIds, ["a2", "b1", "b2"]);
  assert.equal(atStart?.order, 0);
  assert.deepEqual(atStart?.childIds, []);

  const atEnd = planSectionTransfer(tasks, "a1", "Produção", null);
  assert.deepEqual(atEnd?.orderedIds, ["b1", "b2", "a1"]);
  assert.equal(atEnd?.order, 2);
});

test("dropping on an empty section places the task there", () => {
  const plan = planSectionTransfer(tasks, "b2", "Arquivo", null);
  assert.deepEqual(plan?.orderedIds, ["b2"]);
  assert.equal(plan?.order, 0);
  assert.equal(plan?.section, "Arquivo");
});

test("a missing insertion target appends, and same-section drops are not transfers", () => {
  assert.deepEqual(planSectionTransfer(tasks, "a1", "Produção", "missing")?.orderedIds, [
    "b1",
    "b2",
    "a1",
  ]);
  assert.equal(planSectionTransfer(tasks, "a1", "Briefing", "b1"), null);
  assert.equal(planSectionTransfer(tasks, "a1-child", "Produção", null), null);
  assert.equal(planSectionTransfer(tasks, "nope", "Produção", null), null);
});

test("children already in the destination section are not patched again", () => {
  const moved = planSectionTransfer(
    [
      { id: "parent", section: "A" },
      { id: "child", section: "B", parentId: "parent" },
      { id: "grand", section: "A", parentId: "child" },
    ],
    "parent",
    "B",
    null,
  );
  assert.deepEqual(moved?.childIds, ["grand"]);
});

test("the pointer half chooses the root task to insert before", () => {
  const ids = ["b1", "b2", "b3"];
  assert.equal(beforeIdForRow(ids, "b2", false), "b2");
  assert.equal(beforeIdForRow(ids, "b2", true), "b3");
  assert.equal(beforeIdForRow(ids, "b3", true), null);
  assert.equal(beforeIdForRow(ids, "missing", false), null);
});

test("dropping on the section chrome targets the start or the end", () => {
  assert.deepEqual(sectionEdgeTarget(["b1", "b2"], "start"), {
    overTaskId: "b1",
    beforeId: "b1",
  });
  assert.deepEqual(sectionEdgeTarget(["b1", "b2"], "end"), {
    overTaskId: null,
    beforeId: null,
  });
  assert.deepEqual(sectionEdgeTarget([], "start"), { overTaskId: null, beforeId: null });
});
