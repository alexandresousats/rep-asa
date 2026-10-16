export type Priority = "baixa" | "media" | "alta" | "urgente";
export type TaskStatus = "todo" | "doing" | "done";
export type ProjectView = "lista" | "cronograma" | "calendario";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  initials: string;
  role: string;
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
  subtasks: Subtask[];
  comments: Comment[];
  completedAt: string | null;
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

export interface AssistantReply {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
}
