import { query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';

export const byLoggedInUser = query(async () => {
	const user = await requireUser();

	return await UserRepository.preferencesById(user.id);
});

export const prefersNoScreen = query(async () => {
	const loggedInUser = await requireUser();

	return { noScreen: await UserRepository.hasNoScreen([loggedInUser.id]) };
});
