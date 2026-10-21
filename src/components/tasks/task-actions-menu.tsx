"use client";

import {
  ArrowUp,
  CalendarPlus,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  CornerUpLeft,
  FolderPlus,
  GitFork,
  Link2,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Printer,
  Search,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  Workflow,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui/dialog";
import {
  addComment,
  addSubtask,
  createProject,
  createTask,
  updateTask,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { useWorkspace } from "@/lib/workspace";
import type { Task } from "@/lib/types";

export function TaskActionsMenu({
  task,
  canWrite,
  onFocusProjects,
  onFocusSubtasks,
  onFocusTags,
  onTriggerAttach,
  onDeleteTask,
}: {
  task: Task;
  canWrite: boolean;
  onFocusProjects?: () => void;
  onFocusSubtasks?: () => void;
  onFocusTags?: () => void;
  onTriggerAttach?: () => void;
  onDeleteTask: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [generatingSubtasks, setGeneratingSubtasks] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeQuery, setMergeQuery] = useState("");
  const [convertProjectOpen, setConvertProjectOpen] = useState(false);
  const [convertProjectName, setConvertProjectName] = useState("");
  const [convertingProject, setConvertingProject] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const user = useWorkspace((state) => state.user);
  const users = useWorkspace((state) => state.users);
  const allTasks = useWorkspace((state) => state.tasks);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Follow-up task creation
  async function handleCreateFollowUp() {
    setIsOpen(false);
    try {
      const today = new Date();
      today.setDate(today.getDate() + 2);
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dueDate = `${yyyy}-${mm}-${dd}`;

      await createTask({
        projectId: task.projectId,
        section: task.section,
        title: `Acompanhamento: ${task.title}`,
        description: `Tarefa de acompanhamento gerada para verificar o progresso de: "${task.title}".`,
        dueDate,
        assigneeId: user?.id ?? task.assigneeId,
        priority: task.priority,
        tagIds: task.tagIds,
      });

      showToast("Tarefa de acompanhamento criada!");
    } catch {
      showToast("Erro ao criar tarefa de acompanhamento.");
    }
  }

  // Duplicate task
  async function handleDuplicateTask() {
    setIsOpen(false);
    try {
      await createTask({
        projectId: task.projectId,
        section: task.section,
        title: `${task.title} (Cópia)`,
        description: task.description,
        dueDate: task.dueDate,
        startDate: task.startDate,
        assigneeId: task.assigneeId,
        priority: task.priority,
        tagIds: task.tagIds,
      });
      showToast("Tarefa duplicada com sucesso!");
    } catch {
      showToast("Erro ao duplicar tarefa.");
    }
  }

  // Remove as subtask (promote to root task)
  function handleRemoveAsSubtask() {
    setIsOpen(false);
    if (!task.parentId) {
      showToast("Esta já é uma tarefa principal.");
      return;
    }
    updateTask(task.id, { parentId: null });
    showToast("Promovida a tarefa principal!");
  }

  // Copy link
  function handleCopyLink() {
    setIsOpen(false);
    if (typeof window !== "undefined") {
      void navigator.clipboard.writeText(window.location.href);
      showToast("Link copiado para a área de transferência!");
    }
  }

  // Print
  function handlePrint() {
    setIsOpen(false);
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  // AI Summary
  function handleGenerateAiSummary() {
    setIsOpen(false);
    const assignee = users.find((u) => u.id === task.assigneeId)?.name ?? "Sem responsável";
    const subtaskDone = task.subtasks?.filter((s) => s.done).length ?? 0;
    const subtaskTotal = task.subtasks?.length ?? 0;

    const summary = [
      `📌 **Resumo da Tarefa:** ${task.title}`,
      `• **Status:** ${task.status === "done" ? "Concluída" : task.status === "doing" ? "Em andamento" : "A fazer"} | **Prioridade:** ${task.priority.toUpperCase()}`,
      `• **Responsável:** ${assignee} | **Prazo:** ${task.dueDate ? formatDay(task.dueDate) : "Sem prazo"}`,
      subtaskTotal > 0
        ? `• **Subtarefas:** ${subtaskDone} de ${subtaskTotal} concluídas (${Math.round((subtaskDone / subtaskTotal) * 100)}%)`
        : "• **Subtarefas:** Nenhuma subtarefa registrada.",
      task.description ? `• **Descrição:** ${task.description.slice(0, 150)}...` : "• Sem descrição detalhada.",
      task.comments?.length > 0
        ? `• **Última atividade:** ${task.comments.length} comentário(s) registrado(s).`
        : "• Sem comentários recentes.",
    ].join("\n");

    setAiSummaryText(summary);
    setAiSummaryOpen(true);
  }

  // AI Subtasks generation
  async function handleGenerateAiSubtasks() {
    setIsOpen(false);
    setGeneratingSubtasks(true);
    try {
      const titleLower = task.title.toLowerCase();
      let drafts: string[] = [
        "Definir escopo e requisitos iniciais",
        "Executar plano de ação e implementação",
        "Revisar entrega e validar com o responsável",
      ];

      if (titleLower.includes("design") || titleLower.includes("layout") || titleLower.includes("ui")) {
        drafts = [
          "Criar wireframes e referências visuais",
          "Desenvolver protótipo interativo de alta fidelidade",
          "Coletar feedback da equipe e refinar componentes",
        ];
      } else if (titleLower.includes("bug") || titleLower.includes("erro") || titleLower.includes("fix")) {
        drafts = [
          "Reproduzir e isolar o cenário do problema",
          "Aplicar correção de código e testes automatizados",
          "Validar em ambiente de homologação",
        ];
      } else if (titleLower.includes("relatório") || titleLower.includes("análise")) {
        drafts = [
          "Coletar dados e métricas do período",
          "Consolidar gráficos e destaques principais",
          "Compartilhar apresentação com os envolvidos",
        ];
      }

      for (const draft of drafts) {
        await addSubtask(task.id, draft);
      }
      showToast(`${drafts.length} subtarefas criadas com IA!`);
    } catch {
      showToast("Não foi possível gerar subtarefas.");
    } finally {
      setGeneratingSubtasks(false);
    }
  }

  // Convert task to project
  async function handleConvertProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!convertProjectName.trim()) return;
    setConvertingProject(true);
    try {
      const proj = await createProject({
        name: convertProjectName.trim(),
        description: task.description || `Projeto criado a partir da tarefa: ${task.title}`,
        color: "#8b5cf6",
      });

      // If task had subtasks, create them as tasks in the new project
      if (task.subtasks && task.subtasks.length > 0) {
        for (const sub of task.subtasks) {
          await createTask({
            projectId: proj.id,
            title: sub.title,
            section: "A fazer",
          });
        }
      }

      setConvertProjectOpen(false);
      showToast(`Projeto "${proj.name}" criado com sucesso!`);
      router.push(`/projetos/${proj.id}`);
    } catch {
      showToast("Erro ao converter tarefa em projeto.");
    } finally {
      setConvertingProject(false);
    }
  }

  // Merge duplicate tasks
  async function handleMergeTasks() {
    if (!mergeTargetId) return;
    const target = allTasks.find((t) => t.id === mergeTargetId);
    if (!target) return;

    try {
      const mergedDescription = [
        target.description || "",
        `\n\n--- Tarefa mesclada: ${task.title} ---\n${task.description || "Sem descrição"}`,
      ].join("");

      updateTask(target.id, { description: mergedDescription });
      await addComment(target.id, `Mesclou a tarefa duplicada: "${task.title}".`);
      updateTask(task.id, {
        status: "done",
        description: `(Mesclada com "${target.title}")\n\n` + (task.description || ""),
      });

      setMergeDialogOpen(false);
      showToast(`Tarefas mescladas em "${target.title}"!`);
    } catch {
      showToast("Erro ao mesclar tarefas.");
    }
  }

  const shortcutHandlersRef = useRef({
    onFocusProjects,
    onFocusSubtasks,
    onFocusTags,
    handleCreateFollowUp,
    onDeleteTask,
  });

  useEffect(() => {
    shortcutHandlersRef.current = {
      onFocusProjects,
      onFocusSubtasks,
      onFocusTags,
      handleCreateFollowUp,
      onDeleteTask,
    };
  });

  // Global Keyboard Shortcuts (Tab + Key)
  useEffect(() => {
    let tabPressedAt = 0;

    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      if (e.key === "Tab") {
        tabPressedAt = Date.now();
      }

      const isRecentTab = Date.now() - tabPressedAt < 1200;

      // Tab + P -> Adicionar aos projetos
      if ((isRecentTab || e.altKey) && (e.key === "p" || e.key === "P") && !isInput) {
        e.preventDefault();
        shortcutHandlersRef.current.onFocusProjects?.();
        showToast("Atalho: Adicionar aos projetos");
      }

      // Tab + S -> Adicionar subtarefa
      if ((isRecentTab || e.altKey) && (e.key === "s" || e.key === "S") && !isInput) {
        e.preventDefault();
        shortcutHandlersRef.current.onFocusSubtasks?.();
        showToast("Atalho: Adicionar subtarefa");
      }

      // Tab + T -> Adicionar tags
      if ((isRecentTab || e.altKey) && (e.key === "t" || e.key === "T") && !isInput) {
        e.preventDefault();
        shortcutHandlersRef.current.onFocusTags?.();
        showToast("Atalho: Adicionar tags");
      }

      // Shift + Tab + F -> Criar tarefa de acompanhamento
      if (e.shiftKey && (isRecentTab || e.altKey) && (e.key === "f" || e.key === "F") && !isInput) {
        e.preventDefault();
        void shortcutHandlersRef.current.handleCreateFollowUp();
      }

      // Shift + Tab + D -> Juntar tarefas duplicadas
      if (e.shiftKey && (isRecentTab || e.altKey) && (e.key === "d" || e.key === "D") && !isInput) {
        e.preventDefault();
        setMergeDialogOpen(true);
      }

      // Tab + Delete or Tab + Backspace -> Excluir tarefa
      if ((isRecentTab || e.altKey) && (e.key === "Delete" || e.key === "Backspace") && !isInput) {
        e.preventDefault();
        shortcutHandlersRef.current.onDeleteTask();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Mais ações da tarefa"
        title="Mais ações"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "rounded-full p-1.5 transition-colors",
          isOpen ? "bg-hover text-ink" : "text-faint hover:bg-hover hover:text-ink",
        )}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {/* Floating Action Menu */}
      {isOpen ? (
        <MenuDropdown
          anchorRef={buttonRef}
          canWrite={canWrite}
          isSubtask={Boolean(task.parentId)}
          onClose={() => setIsOpen(false)}
          onFocusProjects={() => {
            setIsOpen(false);
            onFocusProjects?.();
          }}
          onFocusSubtasks={() => {
            setIsOpen(false);
            onFocusSubtasks?.();
          }}
          onFocusTags={() => {
            setIsOpen(false);
            onFocusTags?.();
          }}
          onTriggerAttach={() => {
            setIsOpen(false);
            onTriggerAttach?.();
          }}
          onCreateFollowUp={() => void handleCreateFollowUp()}
          onOpenMerge={() => {
            setIsOpen(false);
            setMergeDialogOpen(true);
          }}
          onAiSummary={handleGenerateAiSummary}
          onAiSubtasks={() => void handleGenerateAiSubtasks()}
          onOpenConvertProject={() => {
            setIsOpen(false);
            setConvertProjectName(task.title);
            setConvertProjectOpen(true);
          }}
          onDuplicate={() => void handleDuplicateTask()}
          onRemoveAsSubtask={handleRemoveAsSubtask}
          onPrint={handlePrint}
          onCopyLink={handleCopyLink}
          onDeleteTask={() => {
            setIsOpen(false);
            onDeleteTask();
          }}
        />
      ) : null}

      {/* Toast Notification */}
      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-line bg-elevated px-4 py-2.5 text-xs font-medium text-ink shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="h-4 w-4 text-emerald-500" />
          <span>{toast}</span>
        </div>
      ) : null}

      {/* Generating subtasks overlay indicator */}
      {generatingSubtasks ? (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-line bg-elevated px-4 py-2.5 text-xs font-medium text-ink shadow-2xl">
          <Loader2 className="h-4 w-4 animate-spin text-ink" />
          <span>Gerando subtarefas com inteligência artificial...</span>
        </div>
      ) : null}

      {/* AI Summary Dialog */}
      <Dialog
        open={aiSummaryOpen}
        title="Resumo da tarefa por IA"
        onClose={() => setAiSummaryOpen(false)}
      >
        <div className="space-y-4 text-xs text-ink leading-relaxed">
          <div className="rounded-xl border border-line/60 bg-base/50 p-3.5 space-y-2 whitespace-pre-line">
            {aiSummaryText}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(aiSummaryText);
                showToast("Resumo copiado!");
                setAiSummaryOpen(false);
              }}
              className="rounded-xl border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-hover transition-colors"
            >
              Copiar resumo
            </button>
            <button
              type="button"
              onClick={async () => {
                await addComment(task.id, aiSummaryText);
                showToast("Resumo adicionado aos comentários!");
                setAiSummaryOpen(false);
              }}
              className="rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-base hover:opacity-90 transition-opacity"
            >
              Inserir como comentário
            </button>
          </div>
        </div>
      </Dialog>

      {/* Convert into project dialog */}
      <Dialog
        open={convertProjectOpen}
        title="Converter em projeto"
        onClose={() => setConvertProjectOpen(false)}
      >
        <form onSubmit={handleConvertProjectSubmit} className="space-y-4 text-xs">
          <p className="text-faint">
            Crie um novo projeto dedicado com esta tarefa. As subtarefas serão convertidas
            automaticamente em tarefas do novo projeto.
          </p>
          <div>
            <label className="mb-1 block font-medium text-ink">Nome do novo projeto</label>
            <input
              type="text"
              value={convertProjectName}
              onChange={(e) => setConvertProjectName(e.target.value)}
              className="w-full rounded-xl border border-line bg-base px-3 py-2 text-xs text-ink outline-none focus:border-ink transition-colors"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConvertProjectOpen(false)}
              className="rounded-xl border border-line px-3 py-1.5 text-xs text-faint hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={convertingProject}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-base hover:opacity-90"
            >
              {convertingProject ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              <span>Criar projeto</span>
            </button>
          </div>
        </form>
      </Dialog>

      {/* Merge duplicate tasks dialog */}
      <Dialog
        open={mergeDialogOpen}
        title="Juntar tarefas duplicadas"
        onClose={() => setMergeDialogOpen(false)}
      >
        <div className="space-y-3 text-xs">
          <p className="text-faint">
            Escolha a tarefa principal onde os dados desta tarefa serão consolidados:
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-faint pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar tarefa para juntar..."
              value={mergeQuery}
              onChange={(e) => setMergeQuery(e.target.value)}
              className="w-full rounded-xl border border-line bg-base py-2 pl-8 pr-3 text-xs text-ink outline-none focus:border-ink"
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1">
            {allTasks
              .filter(
                (t) =>
                  t.id !== task.id &&
                  t.title.toLowerCase().includes(mergeQuery.toLowerCase()),
              )
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMergeTargetId(t.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors",
                    mergeTargetId === t.id
                      ? "border border-ink bg-hover text-ink"
                      : "hover:bg-hover text-muted hover:text-ink",
                  )}
                >
                  <span className="truncate font-medium">{t.title}</span>
                  {mergeTargetId === t.id ? (
                    <Check className="h-3.5 w-3.5 text-ink shrink-0" />
                  ) : null}
                </button>
              ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
            <button
              type="button"
              onClick={() => setMergeDialogOpen(false)}
              className="rounded-xl border border-line px-3 py-1.5 text-xs text-faint hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!mergeTargetId}
              onClick={() => void handleMergeTasks()}
              className="rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-base hover:opacity-90 disabled:opacity-40"
            >
              Juntar tarefas
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function MenuDropdown({
  anchorRef,
  canWrite,
  isSubtask,
  onClose,
  onFocusProjects,
  onFocusSubtasks,
  onFocusTags,
  onTriggerAttach,
  onCreateFollowUp,
  onOpenMerge,
  onAiSummary,
  onAiSubtasks,
  onOpenConvertProject,
  onDuplicate,
  onRemoveAsSubtask,
  onPrint,
  onCopyLink,
  onDeleteTask,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  canWrite: boolean;
  isSubtask: boolean;
  onClose: () => void;
  onFocusProjects: () => void;
  onFocusSubtasks: () => void;
  onFocusTags: () => void;
  onTriggerAttach: () => void;
  onCreateFollowUp: () => void;
  onOpenMerge: () => void;
  onAiSummary: () => void;
  onAiSubtasks: () => void;
  onOpenConvertProject: () => void;
  onDuplicate: () => void;
  onRemoveAsSubtask: () => void;
  onPrint: () => void;
  onCopyLink: () => void;
  onDeleteTask: () => void;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [showConvertSubmenu, setShowConvertSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 270;

      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;

      if (left < 8) left = Math.max(8, rect.left);
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      const estimatedHeight = 440;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }

      setCoords({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-task-actions-menu
      style={{
        top: coords.top,
        left: coords.left,
        width: 270,
      }}
      className="fixed z-50 rounded-2xl border border-line bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md menu-in text-xs text-ink"
    >
      {/* Group 1: Projects, Subtasks, Tags, Attachments, Follow-up, Duplicates */}
      <div className="space-y-0.5">
        <MenuItem
          icon={<ClipboardList className="h-4 w-4 text-faint" />}
          label="Adicionar aos projetos"
          shortcuts={["Tab", "P"]}
          onClick={onFocusProjects}
          disabled={!canWrite}
        />
        <MenuItem
          icon={<GitFork className="h-4 w-4 text-faint" />}
          label="Adicionar subtarefa"
          shortcuts={["Tab", "S"]}
          onClick={onFocusSubtasks}
          disabled={!canWrite}
        />
        <MenuItem
          icon={<TagIcon className="h-4 w-4 text-faint" />}
          label="Adicionar tags"
          shortcuts={["Tab", "T"]}
          onClick={onFocusTags}
          disabled={!canWrite}
        />
        <MenuItem
          icon={<Paperclip className="h-4 w-4 text-faint" />}
          label="Anexar arquivos"
          onClick={onTriggerAttach}
          disabled={!canWrite}
        />
        <MenuItem
          icon={<CalendarPlus className="h-4 w-4 text-faint" />}
          label="Criar tarefa de acompanh..."
          shortcuts={["⇧", "Tab", "F"]}
          onClick={onCreateFollowUp}
          disabled={!canWrite}
        />
        <MenuItem
          icon={<ArrowUp className="h-4 w-4 text-faint" />}
          label="Juntar tarefas duplicadas"
          shortcuts={["⇧", "Tab", "D"]}
          onClick={onOpenMerge}
          disabled={!canWrite}
        />
      </div>

      <div className="my-1.5 h-px bg-line-subtle" />

      {/* Group 2: AI Actions */}
      <div className="space-y-0.5">
        <MenuItem
          icon={<Sparkles className="h-4 w-4 text-purple-400" />}
          label="Resumir a tarefa"
          onClick={onAiSummary}
        />
        <MenuItem
          icon={<Sparkles className="h-4 w-4 text-purple-400" />}
          label="Criar rascunhos de subtarefas"
          onClick={onAiSubtasks}
          disabled={!canWrite}
        />
      </div>

      <div className="my-1.5 h-px bg-line-subtle" />

      {/* Group 3: Converter, Duplicar, Remover subtarefa, Imprimir, Copiar link */}
      <div className="space-y-0.5 relative">
        <div
          onMouseEnter={() => setShowConvertSubmenu(true)}
          onMouseLeave={() => setShowConvertSubmenu(false)}
          className="relative"
        >
          <button
            type="button"
            onClick={onOpenConvertProject}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <div className="flex items-center gap-2.5">
              <Workflow className="h-4 w-4 text-faint" />
              <span>Converter em</span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-faint" />
          </button>

          {/* Submenu for convert */}
          {showConvertSubmenu ? (
            <div className="absolute right-full top-0 mr-1 w-44 rounded-xl border border-line bg-elevated/95 p-1 shadow-xl backdrop-blur-md menu-in">
              <button
                type="button"
                onClick={onOpenConvertProject}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted hover:bg-hover hover:text-ink"
              >
                <FolderPlus className="h-3.5 w-3.5 text-faint" />
                <span>Converter em projeto</span>
              </button>
            </div>
          ) : null}
        </div>

        <MenuItem
          icon={<Copy className="h-4 w-4 text-faint" />}
          label="Duplicar a tarefa"
          onClick={onDuplicate}
          disabled={!canWrite}
        />

        {isSubtask ? (
          <MenuItem
            icon={<CornerUpLeft className="h-4 w-4 text-faint" />}
            label="Remover como subtarefa"
            onClick={onRemoveAsSubtask}
            disabled={!canWrite}
          />
        ) : null}

        <MenuItem
          icon={<Printer className="h-4 w-4 text-faint" />}
          label="Imprimir"
          onClick={onPrint}
        />

        <MenuItem
          icon={<Link2 className="h-4 w-4 text-faint" />}
          label="Tornar público / Copiar link"
          onClick={onCopyLink}
        />
      </div>

      <div className="my-1.5 h-px bg-line-subtle" />

      {/* Group 4: Destructive */}
      <div>
        <MenuItem
          icon={<Trash2 className="h-4 w-4 text-red-500" />}
          label="Excluir a tarefa"
          shortcuts={["Tab", "Del"]}
          destructive
          onClick={onDeleteTask}
          disabled={!canWrite}
        />
      </div>
    </div>,
    document.body,
  );
}

function MenuItem({
  icon,
  label,
  shortcuts,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  shortcuts?: string[];
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none",
        destructive
          ? "text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
          : "text-muted hover:bg-hover hover:text-ink",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>

      {shortcuts && shortcuts.length > 0 ? (
        <span className="ml-2 flex shrink-0 items-center gap-1">
          {shortcuts.map((key) => (
            <kbd
              key={key}
              className="rounded-md border border-line bg-base/80 px-1.5 py-0.5 text-[9px] font-semibold text-faint shadow-2xs group-hover:border-line-subtle group-hover:text-ink"
            >
              {key}
            </kbd>
          ))}
        </span>
      ) : null}
    </button>
  );
}
