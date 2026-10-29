export type Priority = "baixa" | "media" | "alta" | "urgente";
export type TaskStatus = "todo" | "doing" | "done";
export type ProjectView = "lista" | "cronograma" | "calendario" | "kanban" | "painel" | "demandas" | "aprovacoes";
export type ProjectsLayout = "grid" | "list";
export type TaskViewMode = "sidebar" | "modal";
export type AccessLevel = "admin" | "editor" | "leitura" | "cliente";
export type ApprovalStatus = "none" | "pending" | "approved" | "changes_requested";
export type DemandFormat = "card" | "carrossel" | "video_longo" | "reels";

export interface SeatInfo {
  people: number;
  capacity: number;
  included: number;
  max: number;
  extraSeats: number;
  seatPacks: number;
  period: "month" | "quarter";
  periodLabel: string;
  totalLabel: string;
  singlePriceLabel: string;
  packPriceLabel: string;
  usageLabel: string;
  canAddSingle: boolean;
  canAddPack: boolean;
  canRemoveSingle: boolean;
  canRemovePack: boolean;
  canSwitchPeriod: boolean;
  purchasable: boolean;
}

export interface BillingInfo {
  active: boolean;
  configured: boolean;
  status:
    | "pending"
    | "active"
    | "past_due"
    | "on_hold"
    | "paused"
    | "cancelled"
    | "failed"
    | "expired"
    | null;
  statusLabel: string;
  action: "checkout" | "portal" | "none";
  priceLabel: string | null;
  productName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: SeatInfo | null;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone?: string | null;
  emailVerified?: boolean;
  hasPassword?: boolean;
  password?: string;
  initials: string;
  role: string;
  access: AccessLevel;
  avatar?: string | null;
  master?: boolean;
  owner?: boolean;
  membershipStatus?: "pending" | "active" | null;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  logo?: string | null;
}

export interface WorkspaceMembership {
  id: string;
  name: string;
  access: AccessLevel;
}

export interface WorkspaceInvite {
  workspaceId: string;
  workspaceName: string;
  role: string;
  access: AccessLevel;
}

export interface AppNotification {
  id: string;
  type: "task_assigned" | "comment" | "project_member" | "message" | "workspace_invite";
  title: string;
  body: string;
  href: string | null;
  workspaceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  secret?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description: string;
  memberIds: string[];
  sections?: string[];
  createdAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  dueDate?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  startDate: string | null;
  priority: Priority;
  status: TaskStatus;
  tagIds: string[];
  section: string;
  order?: number;
  parentId?: string | null;
  subtasks: Subtask[];
  comments: Comment[];
  followerIds?: string[];
  attachments?: TaskAttachment[];
  completedAt: string | null;
  createdAt: string;
  isDemand?: boolean;
  demandFormat?: string | null;
  referenceUrls?: string | null;
  approvalStatus?: ApprovalStatus;
  approvalFeedback?: string | null;
  approvedAt?: string | null;
  approvedById?: string | null;
  approvedByClientName?: string | null;
  clientFeedback?: ClientFeedbackEntry[];
}

export interface ClientFeedbackEntry {
  id: string;
  kind: "approved" | "changes_requested";
  clientName: string;
  clientEmail: string | null;
  message: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface MessageThread {
  id: string;
  title: string;
  projectId: string | null;
  participantIds: string[];
  lastMessageAt: string;
}

export interface HeatmapCell {
  date: string;
  count: number;
}

export interface InsightStats {
  totalCompleted: number;
  mostActiveMonth: string;
  mostActiveWeekday: string;
  longestStreak: number;
  currentStreak: number;
  heatmap: HeatmapCell[];
  projectProgress: { projectId: string; percent: number }[];
  memberLoad: {
    userId: string;
    done: number;
    open: number;
    overdue: number;
  }[];
}

export type McpTransport = "http" | "sse";

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: McpTransport;
  apiKey: string;
  enabled: boolean;
}

export type AgentPreset = "openai" | "xai" | "openrouter" | "custom";

export interface AgentSettings {
  preset: AgentPreset;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ChatToolStep {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
}

export interface ChatAudioAttachment {
  url: string;
  duration?: number;
  mimeType?: string;
}

export interface ChatDocumentAttachment {
  name: string;
  size: number;
  type: string;
  pageCount?: number;
  text: string;
  // Páginas renderizadas quando o PDF não tem texto selecionável (ex.: Illustrator).
  pageImages?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps: ChatToolStep[];
  error?: string;
  pending?: boolean;
  images?: string[];
  audio?: ChatAudioAttachment;
  documents?: ChatDocumentAttachment[];
  createdAt: string;
  /** Quem escreveu, quando a conversa é compartilhada com a equipe. Vem do servidor. */
  authorId?: string | null;
  authorName?: string | null;
}

export interface ChatFolder {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  folderId: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  /** Preenchido quando a conversa está na lixeira. A exclusão permanente ocorre 30 dias depois. */
  deletedAt?: string | null;
  /** Conversa de outra pessoa da equipe: dá para ler e continuar, não para apagar ou editar. */
  shared?: boolean;
  ownerName?: string;
  /** false enquanto as mensagens ainda não vieram do servidor. */
  loaded?: boolean;
}

export interface AgentSharing {
  enabled: boolean;
  members: {
    userId: string;
    name: string;
    email: string;
    access: "admin" | "editor" | "leitura" | "cliente";
    owner: boolean;
    shared: boolean;
  }[];
}

export interface WorkspaceStorage {
  files: number;
  agent: number;
  total: number;
  limit: number;
}

export interface AssistantReply {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
}


export type ShareVisibility = "public" | "private";

export interface ShareLink {
  id: string;
  projectId: string;
  label: string;
  visibility: ShareVisibility;
  hasPin: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastAccessAt: string | null;
  accessCount: number;
  createdById: string;
}

export interface ShareLinkInput {
  label?: string;
  expiresAt?: string | null;
  visibility?: ShareVisibility;
  pin?: string;
}

export type ShareLinkActivity =
  | {
      id: string;
      kind: "view" | "unlock_ok" | "unlock_fail" | "unlock_blocked";
      visitor: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "approved" | "changes_requested";
      clientName: string;
      task: { id: string; title: string };
      createdAt: string;
    };
