import { form } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import { parseFormData } from '$lib/server/remote-functions';
import { updateSchema } from './schemas';

export const updateBooleanPreferences = form(async (formData) => {
	const user = await requireUser();
	const data = parseFormData({
		formData,
		schema: updateSchema
	});

	await UserRepository.updatePreferences(user.id, data);
});
