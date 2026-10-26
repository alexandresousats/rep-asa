import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  formatAsanaDate,
  htmlToNotes,
  linkCsvTasks,
  notesToHtml,
  parseAsanaCsv,
  parseAsanaDate,
  tasksToAsanaCsv,
} from "./asana-csv";

const SAMPLE = `Task ID,Created At,Completed At,Last Modified,Name,Assignee,Assignee Email,Start Date,Due Date,Tags,Notes,Projects,Parent task,Blocked By (Dependencies),Blocking (Dependencies),AAIB,Pedido de criação
"1219021542135161",2026-09-30,,2026-10-14,[CARD] “Quer colocar a sua própria marca no mercado?”,,,,2026-11-04,,,AÇAÍ BARUK,,,,AAIB-138,Novo
`;

test("reads an Asana project export, including custom fields", () => {
  const parsed = parseAsanaCsv(SAMPLE);
  assert.equal(parsed.tasks.length, 1);
  const task = parsed.tasks[0];
  assert.equal(task.taskId, "1219021542135161");
  assert.equal(task.createdAt, "2026-09-30");
  assert.equal(task.completedAt, null);
  assert.equal(task.lastModified, "2026-10-14");
  assert.equal(task.name, "[CARD] “Quer colocar a sua própria marca no mercado?”");
  assert.equal(task.dueDate, "2026-11-04");
  assert.equal(task.startDate, null);
  assert.deepEqual(task.projects, ["AÇAÍ BARUK"]);
  assert.equal(task.customFields.AAIB, "AAIB-138");
  assert.equal(task.customFields["Pedido de criação"], "Novo");
  assert.equal(parsed.columns.section, false);
  assert.deepEqual(parsed.customFieldNames, ["AAIB", "Pedido de criação"]);
});

test("reads the attached Asana file when it is present", () => {
  const path =
    "/Users/alexandresouds/.cursor/projects/Users-alexandresouds-rep-asa/attachments/1ed4ffac-c1a2-44fb-a928-3b29a0173536/_CARD___Quer_colocar_a_sua_pro_pria_marca_no_mercado__.csv";
  if (!existsSync(path)) return;
  const parsed = parseAsanaCsv(readFileSync(path, "utf8"));
  assert.equal(parsed.tasks[0]?.taskId, "1219021542135161");
  assert.equal(parsed.tasks[0]?.customFields["Pedido de criação"], "Novo");
});

test("links the closest parent above and keeps dependencies", () => {
  const csv = [
    "Name,Parent task,Blocked By (Dependencies),Blocking (Dependencies)",
    "Pai,,,Filha",
    "Filha,Pai,Pai,",
    "Pai,,",
    "Filha,Pai,Pai,",
  ].join("\n");
  const parsed = parseAsanaCsv(csv);
  const links = linkCsvTasks(parsed.tasks);
  assert.equal(links[1]?.parentIndex, 0);
  assert.deepEqual(links[1]?.blockedBy, [0]);
  assert.equal(links[3]?.parentIndex, 2);
  assert.deepEqual(links[0]?.blocking, [1]);
});

test("accepts semicolon files and quoted multiline notes", () => {
  const csv = 'Name;Notes;Due Date\n"Tarefa, importante";"linha 1\nlinha 2";04/11/2026\n';
  const parsed = parseAsanaCsv(csv);
  assert.equal(parsed.tasks[0]?.name, "Tarefa, importante");
  assert.equal(parsed.tasks[0]?.notes, "linha 1\nlinha 2");
  assert.equal(parsed.tasks[0]?.dueDate, "2026-04-11");
});

test("round-trips tasks back into the Asana columns", () => {
  const csv = tasksToAsanaCsv([
    {
      taskId: "task-1",
      createdAt: "2026-09-30",
      completedAt: "",
      lastModified: "2026-10-14",
      name: 'Revisão "final"',
      section: "Em andamento",
      assignee: "Ana Souza",
      assigneeEmail: "ana@example.com",
      startDate: "2026-10-01",
      dueDate: "2026-11-04",
      tags: "card, urgente",
      notes: "Primeira linha\nSegunda",
      projects: "AÇAÍ BARUK",
      parent: "",
      blockedBy: "",
      blocking: "Entrega",
      priority: "alta",
      status: "doing",
      customFields: { AAIB: "AAIB-138", "Pedido de criação": "Novo" },
    },
  ]);
  const parsed = parseAsanaCsv(csv);
  const task = parsed.tasks[0];
  assert.equal(task?.taskId, "task-1");
  assert.equal(task?.name, 'Revisão "final"');
  assert.equal(task?.section, "Em andamento");
  assert.equal(task?.notes, "Primeira linha\nSegunda");
  assert.equal(task?.priority, "alta");
  assert.equal(task?.status, "doing");
  assert.equal(task?.customFields.AAIB, "AAIB-138");
  assert.ok(csv.charCodeAt(0) === 0xfeff);
  assert.match(csv, /Section\/Column/);
  assert.match(csv, /Blocked By \(Dependencies\)/);
});

test("parses Asana and Brazilian dates and flattens notes", () => {
  assert.equal(parseAsanaDate("2026-11-04"), "2026-11-04");
  assert.equal(parseAsanaDate("11/04/2026"), "2026-11-04");
  assert.equal(parseAsanaDate("31/04/2026"), null);
  assert.equal(parseAsanaDate("2026-02-31"), null);
  assert.equal(formatAsanaDate("2026-09-30T12:00:00.000Z"), "2026-09-30");
  assert.equal(htmlToNotes("<p>Oi</p><p>Tudo</p>"), "Oi\nTudo");
  assert.equal(notesToHtml("Oi\nTudo"), "Oi<br>Tudo");
});
