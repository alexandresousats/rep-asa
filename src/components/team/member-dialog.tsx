"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updateUser } from "@/lib/api";
import { cn } from "@/lib/cn";
import { displayPersonName, joinPersonName, splitPersonName } from "@/lib/person-name";
import type { AccessLevel, User } from "@/lib/types";

const ACCESS_OPTIONS: { id: AccessLevel; label: string }[] = [
  { id: "admin", label: "Administrador" },
  { id: "editor", label: "Editor" },
  { id: "leitura", label: "Leitura" },
];

export function accessLabel(access: AccessLevel) {
  return ACCESS_OPTIONS.find((item) => item.id === access)?.label ?? "Editor";
}

export function MemberDialog({
  user,
  open,
  onClose,
  canEditAccess,
  requireCurrentPassword,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
  canEditAccess: boolean;
  requireCurrentPassword: boolean;
}) {
  return (
    <Dialog
      open={open && Boolean(user)}
      title={user ? `Editar ${user.name}` : "Editar"}
      onClose={onClose}
      className="max-h-[85vh] max-w-lg overflow-y-auto"
    >
      {user ? (
        <MemberForm
          key={user.id}
          user={user}
          canEditAccess={canEditAccess}
          requireCurrentPassword={requireCurrentPassword}
        />
      ) : null}
    </Dialog>
  );
}

export function MemberForm({
  user,
  requireCurrentPassword,
  canEditAccess,
}: {
  user: User;
  requireCurrentPassword: boolean;
  canEditAccess: boolean;
}) {
  const fallback = splitPersonName(user.name);
  const [firstName, setFirstName] = useState(user.firstName ?? fallback.firstName);
  const [lastName, setLastName] = useState(user.lastName ?? fallback.lastName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [access, setAccess] = useState<AccessLevel>(user.access);
  const [avatar, setAvatar] = useState<string | null>(user.avatar ?? null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function onAvatar(file: File | undefined) {
    setSaved(false);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Envie uma imagem.");
      return;
    }
    try {
      setAvatar(await resizeAvatar(file));
      setAvatarChanged(true);
      setError("");
    } catch {
      setError("Não foi possível ler a imagem.");
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (nextPassword || confirmPassword) {
      if (requireCurrentPassword && !currentPassword) {
        setError("Informe a senha atual.");
        return;
      }
      if (nextPassword !== confirmPassword) {
        setError("A confirmação da senha não confere.");
        return;
      }
    }
    if (!firstName.trim()) {
      setError("Informe o nome.");
      return;
    }
    void updateUser(user.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email,
      role,
      access: canEditAccess ? access : user.access,
      ...(avatarChanged ? { avatar } : {}),
      ...(nextPassword
        ? { password: nextPassword, currentPassword }
        : {}),
    }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setAvatarChanged(false);
      setError("");
      setSaved(true);
    });
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      <div className="flex items-center gap-4">
        <Avatar
          initials={user.initials}
          src={avatar}
          name={joinPersonName(firstName, lastName) || displayPersonName(user)}
          size="lg"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:bg-hover">
            Enviar foto
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onAvatar(file);
              }}
            />
          </label>
          {avatar ? (
            <button
              type="button"
              onClick={() => {
                setAvatar(null);
                setAvatarChanged(true);
                setSaved(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs text-faint hover:text-ink"
            >
              Remover foto
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nome"
          value={firstName}
          autoComplete="given-name"
          onChange={(event) => setFirstName(event.target.value)}
        />
        <Input
          label="Sobrenome"
          value={lastName}
          autoComplete="family-name"
          onChange={(event) => setLastName(event.target.value)}
        />
        <Input label="Cargo" value={role} onChange={(event) => setRole(event.target.value)} />
        <Input
          label="E-mail"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
        {canEditAccess ? (
          <label className="flex w-full flex-col gap-2 text-sm text-muted">
            Nível de acesso
            <select
              value={access}
              onChange={(event) => setAccess(event.target.value as AccessLevel)}
              className="h-11 w-full rounded-2xl border border-line bg-elevated px-4 text-sm text-ink outline-none focus:border-ink"
            >
              {ACCESS_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="flex w-full flex-col gap-2 text-sm text-muted">
            Nível de acesso
            <p className="flex h-11 w-full items-center rounded-2xl border border-line bg-elevated px-4 text-ink">
              {accessLabel(user.access)}
            </p>
          </div>
        )}
      </div>
      <div className="grid gap-4 border-t border-line-subtle pt-4 sm:grid-cols-2">
        {requireCurrentPassword ? (
          <Input
            label="Senha atual"
            type="password"
            value={currentPassword}
            autoComplete="current-password"
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        ) : null}
        <div
          className={cn(
            "flex flex-col gap-4",
            !requireCurrentPassword && "sm:max-w-[calc((100%-1rem)/2)]",
          )}
        >
          <Input
            label="Nova senha"
            type="password"
            value={nextPassword}
            autoComplete="new-password"
            placeholder="Deixe em branco para manter"
            onChange={(event) => setNextPassword(event.target.value)}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            value={confirmPassword}
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {saved ? <p className="text-sm text-faint">Perfil atualizado.</p> : null}
      <div className="flex justify-end">
        <Button type="submit">Salvar</Button>
      </div>
    </form>
  );
}

function resizeAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    image.src = url;
  });
}
