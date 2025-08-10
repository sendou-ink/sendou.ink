import z from 'zod';

export const updateSchema = z.object({
	disableBuildAbilitySorting: z.stringbool().optional(),
	disallowScrimPickupsFromUntrusted: z.stringbool().optional()
});
