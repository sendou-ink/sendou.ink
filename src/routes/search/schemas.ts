import { z } from 'zod/v4';

export const searchUsersSchema = z.object({
	input: z.string().max(100).catch(''),
	limit: z.coerce.number().int().min(1).max(25).catch(25)
});
