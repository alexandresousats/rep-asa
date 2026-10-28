/** Item ativo/inativo nas sidebars principal e do chat (cores via CSS vars do tema). */
const SIDEBAR_NAV_ACTIVE =
  "font-medium border border-transparent bg-[var(--sidebar-nav-active-bg)] text-[var(--sidebar-nav-active-fg)] shadow-none";

const SIDEBAR_NAV_IDLE =
  "border border-transparent text-muted hover:bg-hover hover:text-ink";

export function sidebarNavItemClass(active: boolean) {
  return active ? SIDEBAR_NAV_ACTIVE : SIDEBAR_NAV_IDLE;
}

export function sidebarNavIconClass(active: boolean) {
  return active
    ? "text-[var(--sidebar-nav-active-fg)]"
    : "text-muted";
}

/** Subtítulo (ex.: pasta da conversa) legível sobre o fundo ativo. */
export function sidebarNavSubtextClass(active: boolean) {
  return active
    ? "text-[color-mix(in_srgb,var(--sidebar-nav-active-fg)_70%,transparent)]"
    : "text-faint";
}
