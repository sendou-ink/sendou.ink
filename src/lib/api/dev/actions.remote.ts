import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import { seedSchema } from './schemas';
import { seed as seedDb } from '$lib/server/db/seed';

export const seed = command(seedSchema, async (variation) => {
	if (process.env.NODE_ENV === 'production') error(404);

	await seedDb(variation);
});
