"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  downloadWorkspaceCsv,
  importWorkspaceCsv,
  loadSession,
  previewCsvImport,
  type CsvImportReport,
} from "@/lib/api";
import { useAccess, useWorkspace } from "@/lib/workspace";

const MAX_BYTES = 5_000_000;

export function CsvBackupCard() {
  const projects = useWorkspace((state) => state.projects);
  const { canWrite, isAdmin } = useAccess();
  const [projectId, setProjectId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [preview, setPreview] = useState<CsvImportReport | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"export" | "preview" | "import" | null>(null);

  useEffect(() => {
    if (!csvText || !canWrite) return;
    let cancelled = false;
    setBusy("preview");
    setError("");
    setMessage("");
    void previewCsvImport(csvText, projectId || undefined)
      .then((report) => {
        if (!cancelled) setPreview(report);
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setPreview(null);
          setError(reason.message);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy((current) => (current === "preview" ? null : current));
      });
    return () => {
      cancelled = true;
    };
  }, [csvText, projectId, canWrite]);

  return (
    <section>
      <h2 className="text-sm font-medium text-ink">Backup CSV</h2>
      <p className="mt-1 mb-4 text-sm text-faint">
        O arquivo segue a exportação de tarefas do Asana: nome, datas, responsável, tags, notas,
        projeto, tarefa pai, dependências e campos personalizados. Dá para guardar o espaço e abrir
        o mesmo CSV no Asana, ou trazer um CSV exportado de lá.
      </p>
      <Card className="border-none">
        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm text-muted">
            Projeto
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-11 rounded-2xl border border-line bg-base px-4 text-sm text-ink"
            >
              <option value="">Espaço inteiro</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-faint">
            {projectId
              ? "A exportação traz só este projeto. A importação coloca todas as linhas nele."
              : "A exportação traz os projetos de que você participa. A importação usa a coluna Projects e, para um administrador, cria os projetos que ainda não existem."}
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setError("");
                setMessage("");
                setBusy("export");
                void downloadWorkspaceCsv(projectId || undefined)
                  .catch((reason: Error) => setError(reason.message))
                  .finally(() => setBusy((current) => (current === "export" ? null : current)));
              }}
            >
              {busy === "export" ? "Exportando..." : "Exportar CSV"}
            </Button>
          </div>

          {canWrite ? (
            <div className="space-y-4 border-t border-line pt-4">
              <label className="flex flex-col gap-2 text-sm text-muted">
                Arquivo CSV
                <input
                  key={fileKey}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-base"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setPreview(null);
                    setMessage("");
                    setError("");
                    if (!file) {
                      setCsvText("");
                      setFileName("");
                      return;
                    }
                    if (file.size > MAX_BYTES) {
                      setError("O arquivo passa de 5 MB.");
                      setCsvText("");
                      setFileName("");
                      return;
                    }
                    void file.text().then((text) => {
                      setFileName(file.name);
                      setCsvText(text);
                    });
                  }}
                />
              </label>
              {fileName ? <p className="text-xs text-faint">{fileName}</p> : null}
              {busy === "preview" ? <p className="text-sm text-faint">Lendo o arquivo...</p> : null}
              {preview ? <Report report={preview} /> : null}
              {preview && preview.created + preview.updated > 0 ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy("import");
                      setError("");
                      void importWorkspaceCsv(csvText, projectId || undefined)
                        .then(async (report) => {
                          setPreview(null);
                          setCsvText("");
                          setFileName("");
                          setFileKey((value) => value + 1);
                          setMessage(resultMessage(report));
                          await loadSession();
                        })
                        .catch((reason: Error) => setError(reason.message))
                        .finally(() => setBusy((current) => (current === "import" ? null : current)));
                    }}
                  >
                    {busy === "import"
                      ? "Importando..."
                      : `Importar ${qty(preview.created + preview.updated, "tarefa", "tarefas")}`}
                  </Button>
                </div>
              ) : null}
              <p className="text-xs leading-5 text-faint">
                Tarefas com o mesmo Task ID são atualizadas. As demais são criadas. O responsável
                entra pelo e-mail ou pelo nome de quem já está no espaço. Datas no formato
                AAAA-MM-DD, como no arquivo do Asana.
                {isAdmin
                  ? " Projetos novos são criados a partir da coluna Projects."
                  : " A importação usa projetos que já existem."}
              </p>
            </div>
          ) : (
            <p className="border-t border-line pt-4 text-sm text-faint">
              A importação fica com administradores e editores.
            </p>
          )}
          {message ? <p className="text-sm text-faint">{message}</p> : null}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </Card>
    </section>
  );
}

function Report({ report }: { report: CsvImportReport }) {
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>
        {qty(report.tasks, "tarefa", "tarefas")} no arquivo · {qty(report.created, "nova", "novas")} ·{" "}
        {qty(report.updated, "atualizada", "atualizadas")}
        {report.skipped ? ` · ${qty(report.skipped, "ignorada", "ignoradas")}` : ""}
      </p>
      {report.projectsCreated.length > 0 ? (
        <p>Projetos novos: {report.projectsCreated.join(", ")}</p>
      ) : null}
      {report.warnings.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-auto text-xs leading-5 text-faint">
          {report.warnings.map((warning, index) => (
            <li key={`${index}-${warning}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function resultMessage(report: CsvImportReport) {
  const parts = [
    qty(report.created, "criada", "criadas"),
    qty(report.updated, "atualizada", "atualizadas"),
  ];
  if (report.skipped) parts.push(qty(report.skipped, "ignorada", "ignoradas"));
  return `Importação concluída: ${parts.join(", ")}.`;
}

function qty(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
