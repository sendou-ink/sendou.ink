import { query } from '$app/server';
import { getUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { z } from 'zod/v4';

export const layoutDataByIdentifier = query(z.string(), async (identifier) => {
	const loggedInUser = await getUser();

	return notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(identifier, loggedInUser?.id)
	);
});

export type ProfileByIdentifierData = Awaited<ReturnType<typeof profileByIdentifier>>;

export const profileByIdentifier = query(z.string(), async (identifier) => {
	return notFoundIfFalsy(await UserRepository.findProfileByIdentifier(identifier));
});
