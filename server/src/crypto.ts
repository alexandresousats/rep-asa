import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function uid(prefix: string) {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashesEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function splitPersonName(full: string) {
  const trimmed = full.trim();
  const space = trimmed.indexOf(" ");
  if (space <= 0) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function joinPersonName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function initialsFrom(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function personNameFields(firstName: string, lastName: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  const name = joinPersonName(first, last);
  return {
    firstName: first,
    lastName: last,
    name,
    initials: initialsFrom(name),
  };
}
