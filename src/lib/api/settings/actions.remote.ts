import { command } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import { validatedForm } from '$lib/server/remote-functions';
import { logger } from '$lib/utils/logger';
import { prefersNoScreen } from './queries.remote';
import { updateAccessibilitySettingsSchema, updatePreferencesSchema } from './schemas';

export const updateBooleanPreferences = command(updatePreferencesSchema, async (data) => {
	const user = await requireUser();

	await UserRepository.updatePreferences(user.id, data);
});

export const updateAccessibilitySettings = validatedForm(
	updateAccessibilitySettingsSchema,
	async (data, user) => {
		await UserRepository.updateAccessibilitySettings(user.id, data);

		logger.info('No screen updated', { userId: user.id });

		await prefersNoScreen().refresh();
	}
);
