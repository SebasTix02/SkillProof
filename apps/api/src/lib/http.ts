import { z } from 'zod';
import { badRequest } from './errors.js';

/** Validates a request body or params and turns zod errors into a readable 400. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw badRequest('invalid_input', `${where}${first?.message ?? 'Invalid input'}`);
  }
  return result.data;
}

export const IdParams = z.object({ id: z.uuid() });
