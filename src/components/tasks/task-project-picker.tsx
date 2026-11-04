"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

export function TaskProjectPicker({
  projectId,
  section,
  projects,
  canWrite,
  onChangeProject,
  onChangeSection,
  variant = "field",
}: {
  projectId: string;
  section: string;
  projects: Project[];
  canWrite: boolean;
  onChangeProject: (projectId: string, section: string) => void;
  onChangeSection: (section: string) => void;
  variant?: "field" | "cell";
}) {
  const [projectOpen, setProjectOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const projectButtonRef = useRef<HTMLButtonElement>(null);
  const sectionButtonRef = useRef<HTMLButtonElement>(null);

  const currentProject = projects.find((p) => p.id === projectId);
  const hasSections = (currentProject?.sections ?? []).length > 0;

  if (variant === "cell") {
    const mark = (
      <span
        className="h-2 w-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: currentProject?.color ?? "#737373" }}
      />
    );
    const name = (
      <span className="truncate font-medium">{currentProject?.name ?? "Sem projeto"}</span>
    );
    return (
      <>
        {canWrite ? (
          <button
            ref={projectButtonRef}
            type="button"
            onClick={() => setProjectOpen((prev) => !prev)}
            aria-expanded={projectOpen}
            aria-label="Alterar projeto"
            className={cn(
              "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-xs text-ink transition-colors hover:border-line hover:bg-elevated hover:shadow-sm",
              projectOpen && "border-line bg-elevated shadow-sm",
            )}
          >
            {mark}
            {name}
          </button>
        ) : (
          <span className="inline-flex max-w-full items-center gap-1.5 px-2 py-1 text-xs text-ink">
            {mark}
            {name}
          </span>
        )}
        {projectOpen && canWrite ? (
          <ProjectMenu
            anchorRef={projectButtonRef}
            currentProjectId={projectId}
            currentSection={section}
            projects={projects}
            onClose={() => setProjectOpen(false)}
            onSelect={(nextProjectId, nextSection) => {
              onChangeProject(nextProjectId, nextSection);
              setProjectOpen(false);
            }}
          />
        ) : null}
      </>
    );
  }

  if (!canWrite) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-ink">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: currentProject?.color ?? "#737373" }}
        />
        <span className="font-medium">{currentProject?.name ?? "Sem projeto"}</span>
        {hasSections ? (
          <>
            <span className="text-line">/</span>
            <span className="text-faint">{section}</span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 text-right">
      {/* Project Selector Trigger */}
      <button
        ref={projectButtonRef}
        type="button"
        onClick={() => {
          setSectionOpen(false);
          setProjectOpen((prev) => !prev);
        }}
        aria-expanded={projectOpen}
        aria-label="Alterar projeto"
        className={cn(
          "group inline-flex items-center gap-2 rounded-xl border border-line/70 bg-base/60 px-2.5 py-1 text-xs text-ink transition-all duration-150 hover:border-line hover:bg-hover",
          projectOpen && "border-ink/50 bg-hover shadow-sm ring-1 ring-ink/10",
        )}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-xs"
          style={{ backgroundColor: currentProject?.color ?? "#737373" }}
        />
        <span className="max-w-[140px] truncate font-medium">
          {currentProject?.name ?? "Selecionar projeto"}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-faint transition-transform duration-150 group-hover:text-ink",
            projectOpen && "rotate-180",
          )}
        />
      </button>

      {/* Section Selector Trigger (if project has sections) */}
      {hasSections ? (
        <div className="inline-flex items-center gap-1.5">
          <span className="text-line text-xs">/</span>
          <button
            ref={sectionButtonRef}
            type="button"
            onClick={() => {
              setProjectOpen(false);
              setSectionOpen((prev) => !prev);
            }}
            aria-expanded={sectionOpen}
            aria-label="Alterar seção do projeto"
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-xl border border-line/70 bg-base/60 px-2 py-1 text-xs text-faint transition-all duration-150 hover:border-line hover:bg-hover hover:text-ink",
              sectionOpen && "border-ink/50 bg-hover text-ink shadow-sm ring-1 ring-ink/10",
            )}
          >
            <span className="max-w-[110px] truncate font-medium">{section}</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-faint transition-transform duration-150 group-hover:text-ink",
                sectionOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      ) : null}

      {/* Project Menu Popover */}
      {projectOpen ? (
        <ProjectMenu
          anchorRef={projectButtonRef}
          currentProjectId={projectId}
          currentSection={section}
          projects={projects}
          onClose={() => setProjectOpen(false)}
          onSelect={(nextProjectId, nextSection) => {
            onChangeProject(nextProjectId, nextSection);
            setProjectOpen(false);
          }}
        />
      ) : null}

      {/* Section Menu Popover */}
      {sectionOpen && currentProject ? (
        <SectionMenu
          anchorRef={sectionButtonRef}
          currentSection={section}
          sections={currentProject.sections ?? []}
          projectName={currentProject.name}
          onClose={() => setSectionOpen(false)}
          onSelect={(nextSection) => {
            onChangeSection(nextSection);
            setSectionOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectMenu({
  anchorRef,
  currentProjectId,
  currentSection,
  projects,
  onClose,
  onSelect,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  currentProjectId: string;
  currentSection: string;
  projects: Project[];
  onClose: () => void;
  onSelect: (projectId: string, section: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim().toLowerCase();
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(trimmed));

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 260;

      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;

      if (left < 8) left = Math.max(8, rect.left);
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      const estimatedHeight = 280;
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
    inputRef.current?.focus();

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
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
      data-project-menu
      style={{
        top: coords.top,
        left: coords.left,
        width: 260,
      }}
      className="fixed z-[80] rounded-2xl border border-line bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md menu-in"
    >
      {/* Search Input */}
      <div className="relative mb-1 flex items-center px-1 pt-0.5">
        <Search className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-faint" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar projeto..."
          className="w-full rounded-xl border border-line/60 bg-base/50 py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-faint outline-none transition-colors focus:border-ink/50 focus:bg-base"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 rounded-full p-0.5 text-faint hover:text-ink"
            aria-label="Limpar busca"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
        <span>Projetos</span>
        <span className="text-[10px] font-normal text-faint">{filtered.length}</span>
      </div>

      <div className="max-h-52 space-y-0.5 overflow-y-auto">
        {filtered.length > 0 ? (
          filtered.map((proj) => {
            const isSelected = proj.id === currentProjectId;
            const sections = proj.sections ?? [];
            const nextSection = sections.includes(currentSection)
              ? currentSection
              : (sections[0] ?? currentSection);

            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => onSelect(proj.id, nextSection)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors",
                  isSelected
                    ? "bg-hover text-ink"
                    : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full shadow-xs"
                  style={{ backgroundColor: proj.color ?? "#737373" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium leading-tight text-ink">
                    {proj.name}
                  </p>
                  <p className="truncate text-[10px] leading-tight text-faint">
                    {sections.length > 0 ? `${sections.length} seções` : "Sem seções"}
                  </p>
                </div>
                {isSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.5} />
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="py-4 text-center text-xs text-faint">
            Nenhum projeto encontrado
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SectionMenu({
  anchorRef,
  currentSection,
  sections,
  projectName,
  onClose,
  onSelect,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  currentSection: string;
  sections: string[];
  projectName: string;
  onClose: () => void;
  onSelect: (section: string) => void;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 200;

      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;

      if (left < 8) left = Math.max(8, rect.left);
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      const estimatedHeight = 180;
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
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
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
      data-section-menu
      style={{
        top: coords.top,
        left: coords.left,
        width: 200,
      }}
      className="fixed z-[80] rounded-2xl border border-line bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md menu-in"
    >
      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Seções ({projectName})
      </div>

      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {sections.map((sec) => {
          const isSelected = sec === currentSection;

          return (
            <button
              key={sec}
              type="button"
              onClick={() => onSelect(sec)}
              className={cn(
                "group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors",
                isSelected
                  ? "bg-hover font-medium text-ink"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              <span className="truncate">{sec}</span>
              {isSelected ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-ink" strokeWidth={2.5} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
