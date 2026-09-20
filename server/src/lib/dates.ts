import { z } from 'zod';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepts an ISO date or datetime. A bare date ("2026-09-30") means "due by the end of that day
 * (UTC)", which is what a due date field should mean; it also keeps the UI free of timezone drift.
 */
export const isoDate = (opts: { endOfDay?: boolean } = { endOfDay: true }) =>
  z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Must be a valid ISO date')
    .transform((s) => {
      const d = new Date(s);
      if (DATE_ONLY.test(s) && opts.endOfDay) d.setUTCHours(23, 59, 59, 999);
      return d;
    });
