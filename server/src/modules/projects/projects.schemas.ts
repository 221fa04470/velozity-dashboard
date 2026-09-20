import { z } from 'zod';

const id = z.number().int().positive();

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  description: z.string().trim().max(5000).default(''),
  clientId: id,
  // Admins may create a project on behalf of a PM. Ignored for PMs (they always own what they create).
  createdById: id.optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(5000),
    clientId: id,
    createdById: id,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const projectIdParams = z.object({ id: z.coerce.number().int().positive() });

export const listProjectsQuery = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});
