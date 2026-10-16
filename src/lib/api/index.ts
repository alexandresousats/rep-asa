import { computeInsights } from "../insights";
import { useAppStore } from "../store";
import type { Priority, Task, TaskStatus } from "../types";
import { askAssistant } from "./assistant";

export { askAssistant };

export function getSessionUser() {
  const { currentUserId, users } = useAppStore.getState();
  return users.find((user) => user.id === currentUserId) ?? null;
}

export function listUsers() {
  return useAppStore.getState().users;
}

export function listProjects() {
  return useAppStore.getState().projects;
}

export function getProject(id: string) {
  return useAppStore.getState().projects.find((project) => project.id === id);
}

export function listTasks(projectId?: string) {
  const tasks = useAppStore.getState().tasks.filter((task) => !task.id.startsWith("hist-"));
  return projectId ? tasks.filter((task) => task.projectId === projectId) : tasks;
}

export function getTask(id: string) {
  return useAppStore.getState().tasks.find((task) => task.id === id);
}

export function listTags() {
  return useAppStore.getState().tags;
}

export function listThreads() {
  return [...useAppStore.getState().threads].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  );
}

export function listMessages(threadId: string) {
  return useAppStore
    .getState()
    .messages.filter((message) => message.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getInsights() {
  const { tasks, projects, users } = useAppStore.getState();
  return computeInsights(tasks, projects, users);
}

export function login(email: string, password: string) {
  return useAppStore.getState().login(email, password);
}

export function signup(input: { name: string; email: string; password: string }) {
  return useAppStore.getState().signup(input);
}

export function logout() {
  useAppStore.getState().logout();
}

export function requestReset(email: string) {
  return useAppStore.getState().requestReset(email);
}

export function confirmReset(token: string, password: string) {
  return useAppStore.getState().confirmReset(token, password);
}

export function createProject(input: { name: string; description: string; color: string }) {
  return useAppStore.getState().createProject(input);
}

export function createTask(input: {
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  priority?: Priority;
  tagIds?: string[];
  section?: string;
}) {
  return useAppStore.getState().createTask(input);
}

export function updateTask(id: string, patch: Partial<Task>) {
  useAppStore.getState().updateTask(id, patch);
}

export function setTaskStatus(id: string, status: TaskStatus) {
  useAppStore.getState().setTaskStatus(id, status);
}

export function addSubtask(taskId: string, title: string) {
  useAppStore.getState().addSubtask(taskId, title);
}

export function toggleSubtask(taskId: string, subtaskId: string) {
  useAppStore.getState().toggleSubtask(taskId, subtaskId);
}

export function addComment(taskId: string, body: string) {
  useAppStore.getState().addComment(taskId, body);
}

export function createTag(name: string, color: string) {
  return useAppStore.getState().createTag(name, color);
}

export function updateTag(id: string, patch: { name?: string; color?: string }) {
  useAppStore.getState().updateTag(id, patch);
}

export function deleteTag(id: string) {
  useAppStore.getState().deleteTag(id);
}

export function sendMessage(threadId: string, body: string) {
  return useAppStore.getState().sendMessage(threadId, body);
}

export function createThread(
  title: string,
  participantIds: string[],
  projectId?: string | null,
) {
  return useAppStore.getState().createThread(title, participantIds, projectId);
}
