import z from 'zod';

export const updateSchema = z.object({
	disableBuildAbilitySorting: z.boolean().optional(),
	disallowScrimPickupsFromUntrusted: z.boolean().optional()
});
