"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addMember, quoteSeats, updateSeats } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import type { AccessLevel } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

const ACCESS_OPTIONS: { id: AccessLevel; label: string }[] = [
  { id: "editor", label: "Editor (Equipe)" },
  { id: "admin", label: "Administrador" },
  { id: "cliente", label: "Cliente (Demandas & Aprovações)" },
  { id: "leitura", label: "Apenas Leitura" },
];

export function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [access, setAccess] = useState<AccessLevel>("editor");
  const [projectId, setProjectId] = useState<string>("");
  const [error, setError] = useState("");
  const [seatOffer, setSeatOffer] = useState<{
    message: string;
    extraSeats: number;
    seatPacks: number;
    detail: string;
  } | null>(null);
  const [buying, setBuying] = useState(false);

  const projects = useWorkspace((state) => state.projects);

  function close() {
    setError("");
    setSeatOffer(null);
    onClose();
  }

  async function invite() {
    const result = await addMember({
      name,
      email,
      password: password.trim() || undefined,
      role: role.trim() || (isClient ? "Cliente" : "Membro"),
      access,
      projectId: projectId || undefined,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setRole("");
    setAccess("editor");
    setProjectId("");
    setError("");
    setSeatOffer(null);
    onClose();
  }

  async function buySeats() {
    if (!seatOffer) return;
    setBuying(true);
    setError("");
    try {
      const session = await updateSeats({ extraSeats: seatOffer.extraSeats, seatPacks: seatOffer.seatPacks });
      if (session.url) {
        window.location.assign(session.url);
        return;
      }
      setSeatOffer(null);
      setError("Pedido enviado. Convide de novo quando o Dodo confirmar a nova capacidade.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível comprar as vagas.");
    } finally {
      setBuying(false);
    }
  }

  const isClient = access === "cliente";

  return (
    <Dialog open={open} title={isClient ? "Cadastrar Credenciais de Cliente" : "Convidar para o espaço"} onClose={close}>
      <p className="mb-4 text-sm leading-6 text-faint">
        {isClient
          ? "Crie as credenciais de login para o cliente. Ele terá acesso para solicitar novas demandas e aprovar tarefas do seu projeto."
          : "Este convite entra no espaço de trabalho. A pessoa poderá colaborar nos projetos e tarefas."}
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (isClient && !password.trim()) {
            setError("Defina uma senha para que o cliente possa fazer login.");
            return;
          }
          setError("");
          void quoteSeats(email)
            .then((quote) => {
              if (quote.blocked) {
                setSeatOffer(null);
                setError(quote.message);
                return;
              }
              if (quote.needsPurchase && quote.suggestion) {
                setSeatOffer({
                  message: quote.message,
                  extraSeats: quote.suggestion.extraSeats,
                  seatPacks: quote.suggestion.seatPacks,
                  detail: quote.suggestion.detail,
                });
                return;
              }
              setSeatOffer(null);
              return invite();
            })
            .catch((cause: unknown) => {
              setError(cause instanceof ApiError ? cause.message : "Não foi possível conferir as vagas.");
            });
        }}
      >
        <Input label="Nome completo ou do Cliente" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input
          label="E-mail de acesso"
          type="email"
          value={email}
          autoComplete="off"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Senha de acesso"
          type="password"
          value={password}
          autoComplete="new-password"
          placeholder={isClient ? "Senha para entregar ao cliente" : "Obrigatória se ainda não tem conta"}
          onChange={(event) => setPassword(event.target.value)}
          required={isClient}
        />
        <label className="flex flex-col gap-2 text-sm text-muted">
          Nível de acesso
          <select
            value={access}
            onChange={(event) => {
              const val = event.target.value as AccessLevel;
              setAccess(val);
              if (val === "cliente" && !role) {
                setRole("Cliente");
              }
            }}
            className="h-11 rounded-2xl border border-line bg-base px-4 text-sm text-ink"
          >
            {ACCESS_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {isClient ? (
          <label className="flex flex-col gap-2 text-sm text-muted">
            Projeto do Cliente
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-11 rounded-2xl border border-line bg-base px-4 text-sm text-ink"
            >
              <option value="">Selecione o projeto do cliente...</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Input
          label="Cargo / Identificação"
          value={role}
          placeholder={isClient ? "Ex: Cliente, Responsável Marketing" : "Ex: Designer, Social Media"}
          onChange={(event) => setRole(event.target.value)}
        />
        {seatOffer ? (
          <div className="space-y-3 rounded-2xl bg-elevated px-4 py-3">
            <p className="text-sm text-muted">{seatOffer.message}</p>
            <Button type="button" disabled={buying} onClick={() => void buySeats()}>
              {buying ? "Abrindo…" : `Comprar ${seatOffer.detail}`}
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit">{isClient ? "Criar Credenciais" : "Convidar"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
