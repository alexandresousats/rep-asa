import { addDays, startOfDay } from "date-fns";
import { formatDay, parseDate } from "../dates";
import { computeInsights } from "../insights";
import { useAppStore } from "../store";

function visibleTasks() {
  return useAppStore.getState().tasks.filter((task) => !task.id.startsWith("hist-"));
}

export function askAssistant(prompt: string) {
  const query = prompt.toLowerCase();
  const { users, projects } = useAppStore.getState();
  const tasks = visibleTasks();
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);

  if (query.includes("atrasad")) {
    const overdue = tasks.filter((task) => {
      if (!task.dueDate || task.status === "done") return false;
      return startOfDay(parseDate(task.dueDate)) < today;
    });
    if (overdue.length === 0) {
      return "Nenhuma tarefa atrasada no momento. A equipe está em dia.";
    }
    return [
      `${overdue.length} tarefa(s) atrasada(s):`,
      ...overdue.map((task) => {
        const owner = users.find((user) => user.id === task.assigneeId);
        return `• ${task.title} — ${owner?.name ?? "sem responsável"} · ${formatDay(task.dueDate as string)}`;
      }),
    ].join("\n");
  }

  if (query.includes("semana") || query.includes("vence")) {
    const upcoming = tasks.filter((task) => {
      if (!task.dueDate || task.status === "done") return false;
      const due = startOfDay(parseDate(task.dueDate));
      return due >= today && due <= weekEnd;
    });
    if (upcoming.length === 0) {
      return "Nada vence nos próximos 7 dias.";
    }
    return [
      "O que vence nesta semana:",
      ...upcoming.map((task) => `• ${task.title} · ${formatDay(task.dueDate as string)}`),
    ].join("\n");
  }

  if (
    query.includes("insight") ||
    query.includes("desempenho") ||
    query.includes("equipe") ||
    query.includes("streak")
  ) {
    const insights = computeInsights(useAppStore.getState().tasks, projects, users, today);
    return [
      `A equipe concluiu ${insights.totalCompleted} entregas no histórico.`,
      `Mês mais ativo: ${insights.mostActiveMonth}.`,
      `Maior sequência: ${insights.longestStreak} dias. Sequência atual: ${insights.currentStreak} dia(s).`,
    ].join("\n");
  }

  if (query.includes("projeto")) {
    return projects
      .map((project) => {
        const items = tasks.filter((task) => task.projectId === project.id);
        const open = items.filter((task) => task.status !== "done").length;
        return `• ${project.name}: ${open} abertas de ${items.length}`;
      })
      .join("\n");
  }

  return "Posso ajudar com tarefas atrasadas, o que vence esta semana, projetos abertos ou o desempenho da equipe.";
}
