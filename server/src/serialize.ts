import type {
  Comment,
  Notification,
  Project,
  ProjectMember,
  Section,
  Tag,
  Task,
  TaskTag,
  Thread,
  ThreadParticipant,
  User,
} from "@prisma/client";

export type MembershipView = {
  role: string;
  access: User["access"];
  owner: boolean;
  status: "pending" | "active";
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  access: User["access"];
  avatar: string | null;
  master: boolean;
  owner: boolean;
  membershipStatus: "pending" | "active" | null;
};

export function publicUser(user: User, membership?: MembershipView | null): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    initials: user.initials,
    role: membership?.role ?? user.role,
    access: membership?.access ?? user.access,
    avatar: user.avatar,
    master: false,
    owner: membership?.owner ?? false,
    membershipStatus: membership?.status ?? null,
  };
}

export function publicProject(
  project: Project & { members: Pick<ProjectMember, "userId">[]; sections: Section[] },
) {
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    description: project.description,
    memberIds: project.members.map((member) => member.userId),
    sections: [...project.sections]
      .sort((a, b) => a.position - b.position)
      .map((section) => section.name),
    createdAt: project.createdAt,
  };
}

export function publicTask(
  task: Task & { tags: Pick<TaskTag, "tagId">[]; comments: Comment[] },
) {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
    startDate: task.startDate,
    priority: task.priority,
    status: task.status,
    tagIds: task.tags.map((tag) => tag.tagId),
    section: task.section,
    order: task.order,
    parentId: task.parentId,
    subtasks: [] as [],
    comments: task.comments.map((comment) => ({
      id: comment.id,
      authorId: comment.authorId,
      body: comment.body,
      createdAt: comment.createdAt,
    })),
    completedAt: task.completedAt,
    createdAt: task.createdAt,
  };
}

export function publicTag(tag: Tag) {
  return { id: tag.id, name: tag.name, color: tag.color };
}

export function publicThread(thread: Thread & { participants: ThreadParticipant[] }) {
  return {
    id: thread.id,
    title: thread.title,
    projectId: thread.projectId,
    participantIds: thread.participants.map((person) => person.userId),
    lastMessageAt: thread.lastMessageAt,
  };
}

export function publicNotification(item: Notification) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    href: item.href,
    workspaceId: item.workspaceId,
    readAt: item.readAt ? item.readAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}
