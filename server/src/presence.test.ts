import assert from "node:assert/strict";
import { test } from "node:test";
import { subscribe, type LiveEvent } from "./events";
import { joinPresence, leavePresence, presenceUserIds } from "./presence";

test("presença fica no espaço de quem está com o app aberto", () => {
  const seen: LiveEvent[] = [];
  const stop = subscribe((event) => {
    if (event.kind === "presence") seen.push(event);
  });
  const first = joinPresence("ana", "ws-a");
  const second = joinPresence("bruno", "ws-a");
  const samePerson = joinPresence("ana", "ws-a");
  const otherSpace = joinPresence("ana", "ws-b");

  assert.deepEqual(presenceUserIds("ws-a").sort(), ["ana", "bruno"]);
  assert.deepEqual(presenceUserIds("ws-b"), ["ana"]);
  const last = seen.at(-1);
  assert.equal(last?.kind, "presence");
  if (last?.kind === "presence") assert.deepEqual(last.userIds, ["ana"]);

  leavePresence(samePerson);
  assert.deepEqual(presenceUserIds("ws-a").sort(), ["ana", "bruno"]);
  leavePresence(first);
  leavePresence(second);
  assert.deepEqual(presenceUserIds("ws-a"), []);
  leavePresence(otherSpace);
  assert.deepEqual(presenceUserIds("ws-b"), []);
  leavePresence(first);
  stop();
});
