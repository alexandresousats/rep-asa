"use client";

import { Hash, Headphones, Mic, Plus, Search, Settings, Smile, Users, Volume2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";
import type { User } from "@/lib/types";

const TEXT_CHANNELS = [
  { id: "geral", label: "geral", active: true },
  { id: "demandas", label: "demandas", active: false },
  { id: "aprovacoes", label: "aprovacoes", active: false },
  { id: "criativos", label: "criativos", active: false },
];

const VOICE_CHANNELS = [
  { id: "sala", label: "Sala da equipe" },
  { id: "revisao", label: "Revisão" },
];

const SAMPLE = [
  { author: 0, time: "09:12", body: "Bom dia. O briefing do carrossel de lançamento já está no canal de demandas." },
  { author: 1, time: "09:18", body: "Vi aqui. Falta só a referência de cor da campanha — mando ainda hoje." },
  { author: 0, time: "09:21", body: "Perfeito. Quando fechar, a gente sobe para aprovação do cliente." },
  { author: 2, time: "10:04", body: "Deixei os cortes do reels na pasta. São três opções de abertura." },
  { author: 1, time: "10:11", body: "A segunda abertura ficou mais clara. Podemos seguir com ela." },
];

function previewUsers(users: User[]): User[] {
  const active = users.filter((user) => user.membershipStatus !== "pending");
  if (active.length > 0) return active.slice(0, 8);
  return [
    { id: "voce", name: "Você", initials: "VC", role: "equipe", access: "admin" },
    { id: "equipe", name: "Equipe", initials: "EQ", role: "equipe", access: "editor" },
    { id: "cliente", name: "Cliente", initials: "CL", role: "cliente", access: "cliente" },
  ] as User[];
}

export function DiscordPreview() {
  const workspace = useWorkspace((state) => state.workspace);
  const current = useWorkspace((state) => state.user);
  const users = useWorkspace((state) => state.users);
  const people = previewUsers(users);
  const online = people.slice(0, Math.max(2, Math.ceil(people.length / 2)));
  const offline = people.slice(online.length);

  return (
    <div className="flex h-full min-h-0 bg-base text-ink">
      <aside className="flex w-[240px] shrink-0 flex-col bg-sidebar">
        <div className="flex h-12 items-center border-b border-line px-4 text-sm font-medium shadow-sm">
          <span className="truncate">{workspace?.name ?? "Workspace"}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-2 py-3">
          <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">
            Canais de texto
          </p>
          <ul className="space-y-0.5">
            {TEXT_CHANNELS.map((channel) => (
              <li key={channel.id}>
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
                    channel.active ? "bg-active text-ink" : "text-muted",
                  )}
                >
                  <Hash className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="truncate">{channel.label}</span>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 px-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">
            Canais de voz
          </p>
          <ul className="space-y-0.5">
            {VOICE_CHANNELS.map((channel) => (
              <li key={channel.id}>
                <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted">
                  <Volume2 className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="truncate">{channel.label}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 bg-subtle px-2 py-2">
          <span className="relative">
            <Avatar
              initials={current?.initials ?? people[0]?.initials ?? "?"}
              src={current?.avatar}
              name={current?.name}
              size="sm"
            />
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-subtle bg-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{current?.name ?? "Você"}</p>
            <p className="truncate text-[10px] text-faint">Online</p>
          </div>
          <Mic className="h-4 w-4 text-faint" strokeWidth={1.75} />
          <Headphones className="h-4 w-4 text-faint" strokeWidth={1.75} />
          <Settings className="h-4 w-4 text-faint" strokeWidth={1.75} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col border-x border-line">
        <header className="flex h-12 items-center gap-2 border-b border-line px-4">
          <Hash className="h-5 w-5 text-faint" strokeWidth={1.75} />
          <span className="text-sm font-medium">geral</span>
          <span className="mx-2 h-4 w-px bg-line" />
          <span className="min-w-0 flex-1 truncate text-xs text-faint">
            Canal da equipe para o dia a dia
          </span>
          <Search className="h-4 w-4 text-faint" strokeWidth={1.75} />
          <Users className="h-4 w-4 text-faint" strokeWidth={1.75} />
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-4 py-4">
          <div className="flex items-center gap-3 py-2">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-medium text-faint">Hoje</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          {SAMPLE.map((message, index) => {
            const author = people[message.author % people.length];
            return (
              <div key={index} className="flex gap-3">
                <Avatar initials={author?.initials ?? "?"} src={author?.avatar} name={author?.name} />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium text-ink">{author?.name ?? "Equipe"}</span>
                    <span className="ml-2 text-[11px] text-faint">{message.time}</span>
                  </p>
                  <p className="mt-0.5 text-sm leading-6 text-muted">{message.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-hover text-faint">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-faint">Conversar em #geral</span>
            <Smile className="h-5 w-5 text-faint" strokeWidth={1.75} />
          </div>
        </div>
      </section>

      <aside className="hidden w-[220px] shrink-0 flex-col bg-sidebar lg:flex">
        <MemberGroup label="Online" people={online} online />
        {offline.length > 0 ? <MemberGroup label="Offline" people={offline} /> : null}
      </aside>
    </div>
  );
}

function MemberGroup({
  label,
  people,
  online = false,
}: {
  label: string;
  people: User[];
  online?: boolean;
}) {
  return (
    <div className="px-3 py-3">
      <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">
        {label} — {people.length}
      </p>
      <ul className="space-y-0.5">
        {people.map((person) => (
          <li key={person.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", !online && "opacity-50")}>
            <span className="relative">
              <Avatar initials={person.initials} src={person.avatar} name={person.name} size="sm" />
              <span
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar",
                  online ? "bg-emerald-500" : "bg-faint",
                )}
              />
            </span>
            <span className="truncate text-sm text-ink">{person.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
