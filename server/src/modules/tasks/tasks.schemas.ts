import { z } from 'zod';
import { Priority, TaskStatus } from '@prisma/client';
import { isoDate } from '../../lib/dates';

const id = z.number().int().positive();

export const createTaskSchema = z.object({
  projectId: id,
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).default(''),
  assigneeId: id.nullable().optional(),
  priority: z.nativeEnum(Priority).default('MEDIUM'),
  dueDate: isoDate().nullable().optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    assigneeId: id.nullable(),
    priority: z.nativeEnum(Priority),
    dueDate: isoDate().nullable(),
    status: z.nativeEnum(TaskStatus),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const updateStatusSchema = z.object({ status: z.nativeEnum(TaskStatus) });

export const taskIdParams = z.object({ id: z.coerce.number().int().positive() });

/** "a,b" or repeated ?status=a&status=b -> ['a','b'] */
const list = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return undefined;
    const parts = Array.isArray(v) ? v : String(v).split(',');
    return parts.map((p) => String(p).trim()).filter(Boolean);
  }, z.array(item).max(10).optional());

export const taskQuerySchema = z
  .object({
    status: list(z.nativeEnum(TaskStatus)),
    priority: list(z.nativeEnum(Priority)),
    dueFrom: isoDate({ endOfDay: false }).optional(),
    dueTo: isoDate({ endOfDay: true }).optional(),
    projectId: z.coerce.number().int().positive().optional(),
    assigneeId: z.coerce.number().int().positive().optional(),
    overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    q: z.string().trim().max(100).optional(),
    sort: z.enum(['priority', 'dueDate', 'updatedAt', 'createdAt']).default('priority'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo, {
    message: 'dueFrom must be before dueTo',
    path: ['dueFrom'],
  });

export type TaskQuery = z.infer<typeof taskQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
