export type Role = 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ActivityType = 'TASK_CREATED' | 'STATUS_CHANGED' | 'ASSIGNEE_CHANGED' | 'TASK_OVERDUE';

export const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Person {
  id: number;
  name: string;
}

export interface DirectoryUser extends User {
  isActive: boolean;
  createdAt: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  project: Person;
  assignee: Person | null;
}

export interface Activity {
  id: number;
  type: ActivityType;
  createdAt: string;
  actor: Person | null;
  task: { id: number; title: string };
  project: Person;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  detail: string | null;
}

export interface TaskDetail extends Task {
  activity: Activity[];
}

export interface Project {
  id: number;
  name: string;
  description: string;
  client: Person;
  createdBy: Person;
  createdAt: string;
  taskCounts: Record<TaskStatus, number>;
  totalTasks: number;
  overdueTasks: number;
}

export interface Client {
  id: number;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  projectCount: number;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  type: 'TASK_ASSIGNED' | 'TASK_IN_REVIEW';
  message: string;
  taskId: number | null;
  projectId: number | null;
  read: boolean;
  createdAt: string;
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export type AdminDashboard = {
  role: 'ADMIN';
  totalProjects: number;
  totalTasks: number;
  tasksByStatus: Record<TaskStatus, number>;
  overdueTasks: number;
  activeUsers: number;
  onlineNow: number;
};
export type ManagerDashboard = {
  role: 'PROJECT_MANAGER';
  projects: Project[];
  tasksByStatus: Record<TaskStatus, number>;
  openTasksByPriority: Record<Priority, number>;
  overdueTasks: number;
  dueThisWeek: Task[];
};
export type DeveloperDashboard = {
  role: 'DEVELOPER';
  tasksByStatus: Record<TaskStatus, number>;
  overdueTasks: number;
  assignedTasks: Task[];
};
export type Dashboard = AdminDashboard | ManagerDashboard | DeveloperDashboard;
