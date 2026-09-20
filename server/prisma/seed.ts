/**
 * Seed script: `npm run db:seed`  (wipes the database first)
 * `npm run db:seed -- --if-empty` only seeds when there are no users (used by Docker on every boot).
 *
 * Creates: 1 admin, 2 project managers, 4 developers, 3 clients, 4 projects (6-7 tasks each) in every
 * status, several overdue tasks, a realistic activity history for every task and some notifications.
 * Every account uses the password from SEED_PASSWORD (default "Password123!").
 */
import bcrypt from 'bcryptjs';
import type { ActivityType, Priority, Prisma, TaskStatus, User } from '@prisma/client';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

/** Due dates are "end of day UTC", matching how the API stores date-only values. */
const dueIn = (days: number) => {
  const d = new Date(now + days * DAY);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

interface SeedTask {
  title: string;
  description: string;
  assignee: string; // key in `devs`
  priority: Priority;
  status: TaskStatus;
  createdDaysAgo: number;
  dueInDays: number | null;
}

interface SeedProject {
  name: string;
  description: string;
  client: string;
  owner: 'priya' | 'rohan';
  createdDaysAgo: number;
  tasks: SeedTask[];
}

const PROJECTS: SeedProject[] = [
  {
    name: 'Storefront Redesign',
    description: 'Full redesign of the Northwind web storefront: faster checkout, new design system, accessibility fixes.',
    client: 'Northwind Retail',
    owner: 'priya',
    createdDaysAgo: 14,
    tasks: [
      { title: 'Audit current checkout funnel', description: 'Instrument the funnel and document the top 5 drop-off points.', assignee: 'ravi', priority: 'HIGH', status: 'DONE', createdDaysAgo: 12, dueInDays: -8 },
      { title: 'Hero banner A/B test setup', description: 'Wire the experiment flag and event tracking for two hero variants.', assignee: 'meera', priority: 'LOW', status: 'DONE', createdDaysAgo: 9, dueInDays: -3 },
      { title: 'Design system tokens & component library', description: 'Colour, type and spacing tokens plus buttons, inputs and cards in Storybook.', assignee: 'meera', priority: 'HIGH', status: 'IN_REVIEW', createdDaysAgo: 10, dueInDays: 2 },
      { title: 'Product listing page rebuild', description: 'Server-rendered PLP with filters, sorting and infinite scroll.', assignee: 'ravi', priority: 'CRITICAL', status: 'IN_PROGRESS', createdDaysAgo: 8, dueInDays: -2 },
      { title: 'Cart drawer with saved items', description: 'Slide-in cart with quantity edits and a "save for later" list.', assignee: 'karthik', priority: 'MEDIUM', status: 'IN_PROGRESS', createdDaysAgo: 6, dueInDays: 5 },
      { title: 'Accessibility pass (WCAG AA)', description: 'Keyboard paths, focus states, contrast and screen-reader labels across the funnel.', assignee: 'sana', priority: 'MEDIUM', status: 'TODO', createdDaysAgo: 5, dueInDays: 9 },
      { title: 'Move images to CDN with responsive srcset', description: 'Serve resized WebP/AVIF variants instead of the original uploads.', assignee: 'karthik', priority: 'LOW', status: 'TODO', createdDaysAgo: 4, dueInDays: null },
    ],
  },
  {
    name: 'Patient Portal',
    description: 'Secure portal for Bluepeak Health patients: appointments, lab results and reminders.',
    client: 'Bluepeak Health',
    owner: 'priya',
    createdDaysAgo: 12,
    tasks: [
      { title: 'Email reminder templates', description: 'Appointment reminder + follow-up templates in the approved brand voice.', assignee: 'sana', priority: 'LOW', status: 'DONE', createdDaysAgo: 8, dueInDays: -4 },
      { title: 'Appointment booking API', description: 'Availability search, booking, rescheduling and cancellation endpoints.', assignee: 'ravi', priority: 'CRITICAL', status: 'IN_REVIEW', createdDaysAgo: 9, dueInDays: 1 },
      { title: 'SSO with hospital identity provider', description: 'SAML login against the hospital IdP with just-in-time provisioning.', assignee: 'sana', priority: 'HIGH', status: 'IN_PROGRESS', createdDaysAgo: 7, dueInDays: 4 },
      { title: 'Audit logging for PHI access', description: 'Immutable log of every read of patient data with actor and reason.', assignee: 'karthik', priority: 'CRITICAL', status: 'TODO', createdDaysAgo: 3, dueInDays: -1 },
      { title: 'Lab results view', description: 'Read-only results timeline with reference ranges and PDF download.', assignee: 'meera', priority: 'HIGH', status: 'TODO', createdDaysAgo: 3, dueInDays: 7 },
      { title: 'Load test booking flow', description: 'k6 scenario for 500 concurrent bookings; report p95 latency.', assignee: 'ravi', priority: 'MEDIUM', status: 'TODO', createdDaysAgo: 2, dueInDays: 12 },
    ],
  },
  {
    name: 'Fleet Tracker',
    description: 'Real-time vehicle tracking and alerting for Orbit Logistics dispatchers and drivers.',
    client: 'Orbit Logistics',
    owner: 'rohan',
    createdDaysAgo: 15,
    tasks: [
      { title: 'GPS ingestion service', description: 'Batch and stream ingestion of device pings with de-duplication.', assignee: 'karthik', priority: 'CRITICAL', status: 'DONE', createdDaysAgo: 14, dueInDays: -6 },
      { title: 'Live map component', description: 'Clustered vehicle markers with smooth movement and status colours.', assignee: 'meera', priority: 'HIGH', status: 'IN_REVIEW', createdDaysAgo: 6, dueInDays: 2 },
      { title: 'Driver alert rules engine', description: 'Configurable rules for speeding, idling and route deviation.', assignee: 'ravi', priority: 'HIGH', status: 'IN_PROGRESS', createdDaysAgo: 5, dueInDays: 3 },
      { title: 'Geofence editor', description: 'Draw, edit and name polygons; assign them to vehicle groups.', assignee: 'sana', priority: 'MEDIUM', status: 'IN_PROGRESS', createdDaysAgo: 4, dueInDays: 6 },
      { title: 'Weekly PDF report export', description: 'Scheduled per-fleet mileage and idle-time report.', assignee: 'karthik', priority: 'MEDIUM', status: 'TODO', createdDaysAgo: 3, dueInDays: 10 },
      { title: 'Offline mode for driver app', description: 'Queue status updates locally and sync when the network returns.', assignee: 'sana', priority: 'HIGH', status: 'TODO', createdDaysAgo: 3, dueInDays: -1 },
      { title: 'Dark mode for dispatcher console', description: 'Night-shift palette; respect the OS setting.', assignee: 'meera', priority: 'LOW', status: 'TODO', createdDaysAgo: 2, dueInDays: null },
    ],
  },
  {
    name: 'Loyalty App',
    description: 'Mobile loyalty programme for Northwind: points, rewards and store offers.',
    client: 'Northwind Retail',
    owner: 'rohan',
    createdDaysAgo: 12,
    tasks: [
      { title: 'Points ledger schema', description: 'Double-entry ledger design with expiry and reversal support.', assignee: 'ravi', priority: 'HIGH', status: 'DONE', createdDaysAgo: 11, dueInDays: -5 },
      { title: 'Rewards catalogue screen', description: 'Browsable rewards with point costs and availability.', assignee: 'sana', priority: 'MEDIUM', status: 'IN_PROGRESS', createdDaysAgo: 5, dueInDays: 4 },
      { title: 'Push notification opt-in flow', description: 'Permission priming screen and preference centre.', assignee: 'meera', priority: 'MEDIUM', status: 'IN_REVIEW', createdDaysAgo: 4, dueInDays: 0 },
      { title: 'Fraud checks on redemption', description: 'Velocity limits and device fingerprint checks before a reward is issued.', assignee: 'karthik', priority: 'HIGH', status: 'TODO', createdDaysAgo: 2, dueInDays: 8 },
      { title: 'Store locator integration', description: 'Nearest-store lookup using the client store feed.', assignee: 'ravi', priority: 'LOW', status: 'TODO', createdDaysAgo: 2, dueInDays: 14 },
      { title: 'Copy review with client', description: 'Collect and apply legal + brand feedback on all in-app copy.', assignee: 'sana', priority: 'LOW', status: 'TODO', createdDaysAgo: 1, dueInDays: 3 },
    ],
  },
];

const STEPS: Record<TaskStatus, TaskStatus[]> = {
  TODO: [],
  IN_PROGRESS: ['IN_PROGRESS'],
  IN_REVIEW: ['IN_PROGRESS', 'IN_REVIEW'],
  DONE: ['IN_PROGRESS', 'IN_REVIEW', 'DONE'],
};

async function main() {
  if (process.argv.includes('--if-empty') && (await prisma.user.count()) > 0) {
    console.log('Database already has data, skipping seed.');
    return;
  }

  console.log('Resetting tables...');
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification","ActivityLog","Task","Project","Client","RefreshToken","User" RESTART IDENTITY CASCADE',
  );

  // ---- users ----------------------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(env.SEED_PASSWORD, 10);
  const mkUser = (name: string, email: string, role: User['role']) =>
    prisma.user.create({ data: { name, email, role, passwordHash, lastSeenAt: ago(72 * HOUR) } });

  const admin = await mkUser('Anita Rao', 'admin@velozity.dev', 'ADMIN');
  const pms = {
    priya: await mkUser('Priya Nair', 'priya@velozity.dev', 'PROJECT_MANAGER'),
    rohan: await mkUser('Rohan Mehta', 'rohan@velozity.dev', 'PROJECT_MANAGER'),
  };
  const devs: Record<string, User> = {
    ravi: await mkUser('Ravi Kumar', 'ravi@velozity.dev', 'DEVELOPER'),
    meera: await mkUser('Meera Iyer', 'meera@velozity.dev', 'DEVELOPER'),
    karthik: await mkUser('Karthik Reddy', 'karthik@velozity.dev', 'DEVELOPER'),
    sana: await mkUser('Sana Khan', 'sana@velozity.dev', 'DEVELOPER'),
  };

  // ---- clients --------------------------------------------------------------------------------
  const clients: Record<string, { id: number }> = {};
  for (const [name, contactName, contactEmail] of [
    ['Northwind Retail', 'Elena Brooks', 'elena@northwind.example'],
    ['Bluepeak Health', 'Dr. Arjun Shah', 'arjun@bluepeak.example'],
    ['Orbit Logistics', 'Tom Alvarez', 'tom@orbit.example'],
  ] as const) {
    clients[name] = await prisma.client.create({ data: { name, contactName, contactEmail } });
  }

  // ---- projects, tasks, history -----------------------------------------------------------------
  const logs: Prisma.ActivityLogCreateManyInput[] = [];
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  let taskIndex = 0;

  for (const p of PROJECTS) {
    const owner = pms[p.owner];
    const project = await prisma.project.create({
      data: {
        name: p.name,
        description: p.description,
        clientId: clients[p.client]!.id,
        createdById: owner.id,
        createdAt: ago(p.createdDaysAgo * DAY),
      },
    });

    for (const t of p.tasks) {
      taskIndex += 1;
      const dev = devs[t.assignee]!;
      const createdAt = ago(t.createdDaysAgo * DAY);
      const dueDate = t.dueInDays === null ? null : dueIn(t.dueInDays);
      const isOverdue = t.status !== 'DONE' && dueDate !== null && dueDate.getTime() < now;

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          title: t.title,
          description: t.description,
          assigneeId: dev.id,
          createdById: owner.id,
          status: t.status,
          priority: t.priority,
          dueDate,
          isOverdue,
          createdAt,
          updatedAt: createdAt,
        },
      });

      const log = (type: ActivityType, at: Date, extra: Partial<Prisma.ActivityLogCreateManyInput> = {}) =>
        logs.push({ type, taskId: task.id, projectId: project.id, createdAt: at, ...extra });

      log('TASK_CREATED', createdAt, { actorId: owner.id, toStatus: 'TODO', detail: `assigned to ${dev.name}` });
      notifications.push({
        userId: dev.id,
        type: 'TASK_ASSIGNED',
        message: `${owner.name} assigned you Task #${task.id}: ${t.title}`,
        taskId: task.id,
        projectId: project.id,
        createdAt,
        readAt: t.createdDaysAgo > 3 ? new Date(createdAt.getTime() + 2 * HOUR) : null,
      });

      // Walk the task through its statuses, spread over its lifetime. The developer does the work and
      // moves it to review; the PM signs it off as Done.
      const steps = STEPS[t.status];
      const span = t.createdDaysAgo * DAY - 25 * MIN;
      const stretch = 0.55 + (taskIndex % 5) * 0.09;
      let from: TaskStatus = 'TODO';
      steps.forEach((to, i) => {
        const at = new Date(createdAt.getTime() + span * ((i + 1) / steps.length) * stretch);
        log('STATUS_CHANGED', at, { actorId: to === 'DONE' ? owner.id : dev.id, fromStatus: from, toStatus: to });
        if (to === 'IN_REVIEW') {
          notifications.push({
            userId: owner.id,
            type: 'TASK_IN_REVIEW',
            message: `${dev.name} moved Task #${task.id} to In Review: ${t.title}`,
            taskId: task.id,
            projectId: project.id,
            createdAt: at,
            readAt: t.status === 'DONE' ? new Date(at.getTime() + HOUR) : null,
          });
        }
        from = to;
      });

      if (isOverdue && dueDate) {
        log('TASK_OVERDUE', new Date(Math.min(dueDate.getTime() + 5 * MIN, now - MIN)), { actorId: null });
      }
    }
  }

  // Insert in chronological order so ids grow with time, like they would in real life.
  logs.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  await prisma.activityLog.createMany({ data: logs });
  await prisma.notification.createMany({ data: notifications });

  const counts = {
    users: await prisma.user.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    overdue: await prisma.task.count({ where: { isOverdue: true } }),
    activity: await prisma.activityLog.count(),
    notifications: await prisma.notification.count(),
  };
  console.log('Seeded:', counts);
  console.log(`\nLogin with any of these (password: ${env.SEED_PASSWORD})`);
  console.log(`  admin    ${admin.email}`);
  Object.values(pms).forEach((u) => console.log(`  manager  ${u.email}`));
  Object.values(devs).forEach((u) => console.log(`  dev      ${u.email}`));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
