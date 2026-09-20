import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../middleware/auth';

/**
 * Single source of truth for "who can see what".
 *
 * Every query for projects, tasks and activity goes through one of these functions, and the
 * realtime layer (realtime/publisher.ts) uses the same rules to decide who receives an event.
 * Because the REST catch-up and the live push share the rules, a user can never see over
 * WebSocket something the REST API would have refused to return, or vice versa.
 *
 *   ADMIN            -> everything
 *   PROJECT_MANAGER  -> projects they created, and everything inside them
 *   DEVELOPER        -> tasks assigned to them, and the projects those tasks live in
 */

export const projectScope = (user: AuthUser): Prisma.ProjectWhereInput => {
  switch (user.role) {
    case 'ADMIN':
      return {};
    case 'PROJECT_MANAGER':
      return { createdById: user.id };
    case 'DEVELOPER':
      return { tasks: { some: { assigneeId: user.id } } };
  }
};

export const taskScope = (user: AuthUser): Prisma.TaskWhereInput => {
  switch (user.role) {
    case 'ADMIN':
      return {};
    case 'PROJECT_MANAGER':
      return { project: { createdById: user.id } };
    case 'DEVELOPER':
      return { assigneeId: user.id };
  }
};

export const activityScope = (user: AuthUser): Prisma.ActivityLogWhereInput => {
  switch (user.role) {
    case 'ADMIN':
      return {};
    case 'PROJECT_MANAGER':
      return { project: { createdById: user.id } };
    case 'DEVELOPER':
      return { task: { assigneeId: user.id } };
  }
};

/** Projects the user may create tasks in / edit / delete. Developers manage nothing. */
export const manageableProjectScope = (user: AuthUser): Prisma.ProjectWhereInput => {
  switch (user.role) {
    case 'ADMIN':
      return {};
    case 'PROJECT_MANAGER':
      return { createdById: user.id };
    case 'DEVELOPER':
      return { id: -1 }; // matches nothing; developers never manage projects
  }
};
