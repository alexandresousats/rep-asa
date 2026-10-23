"use client";

import { Link2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DemandsList } from "@/components/demands/demand-list";
import { ShareDemandLinkDialog } from "@/components/demands/share-demand-link-dialog";
import { Button } from "@/components/ui/button";
import type { DemandFormat, Project, Tag, Task, User } from "@/lib/types";

export function ProjectDemandsView({
  project,
  tasks,
  users,
  tags,
  onSelectTask,
  onCreateDemand,
}: {
  project: Project;
  tasks: Task[];
  users: User[];
  tags: Tag[];
  onSelectTask: (id: string) => void;
  onCreateDemand: () => void;
}) {
  const [formatFilter, setFormatFilter] = useState<DemandFormat | "all">("all");
  const [search, setSearch] = useState("");
  const [shareLinkOpen, setShareLinkOpen] = useState(false);

  const demandTasks = useMemo(() => {
    return tasks.filter((t) => {
      const isDem =
        t.isDemand ||
        Boolean(t.demandFormat) ||
        t.section.toLowerCase().includes("demanda") ||
        t.tagIds.some((tagId) => {
          const name = tags.find((item) => item.id === tagId)?.name.toLowerCase() ?? "";
          return ["card", "carrossel", "reels", "vídeo longo", "video longo"].includes(name);
        });
      return isDem && !t.id.startsWith("hist-");
    });
  }, [tasks, tags]);

  const filtered = useMemo(() => {
    return demandTasks.filter((t) => {
      if (formatFilter !== "all") {
        const matchesFormat =
          t.demandFormat === formatFilter ||
          t.tagIds.some((tagId) => {
            const name = tags.find((item) => item.id === tagId)?.name.toLowerCase() ?? "";
            if (formatFilter === "card") return name === "card";
            if (formatFilter === "carrossel") return name === "carrossel";
            if (formatFilter === "reels") return name === "reels";
            if (formatFilter === "video_longo")
              return name.includes("video") || name.includes("vídeo");
            return false;
          });
        if (!matchesFormat) return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesDesc = t.description?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  }, [demandTasks, formatFilter, search, tags]);

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareLinkOpen(true)}
            className="gap-1.5"
          >
            <Link2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Link do agente
          </Button>
          <Button size="sm" onClick={onCreateDemand} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Solicitar demanda
          </Button>
        </div>
        <DemandsList
          filtered={filtered}
          formatFilter={formatFilter}
          setFormatFilter={setFormatFilter}
          search={search}
          setSearch={setSearch}
          projects={[project]}
          users={users}
          onSelect={onSelectTask}
          onCreate={onCreateDemand}
        />
      </div>
      <ShareDemandLinkDialog
        open={shareLinkOpen}
        onClose={() => setShareLinkOpen(false)}
        defaultProjectId={project.id}
      />
    </div>
  );
}
