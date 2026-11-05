import assert from "node:assert/strict";
import test from "node:test";
import { taskParent } from "./tasks";
import type { Task } from "./types";

function task(id: string, parentId: string | null = null): Task {
  return { id, parentId, title: id } as Task;
}

test("taskParent encontra a tarefa de onde a subtarefa saiu", () => {
  const parent = task("pai");
  const child = task("filha", "pai");
  assert.equal(taskParent(child, [parent, child])?.id, "pai");
});

test("taskParent some quando não há tarefa principal ou ela não está acessível", () => {
  const parent = task("pai");
  assert.equal(taskParent(parent, [parent]), null);
  assert.equal(taskParent(task("filha", "apagada"), [parent]), null);
});
