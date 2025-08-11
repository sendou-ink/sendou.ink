import { command } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import { updateSchema } from './schemas';

export const updateBooleanPreferences = command(updateSchema, async (data) => {
	const user = await requireUser();

	await UserRepository.updatePreferences(user.id, data);
});
