import { query } from '$app/server';
import * as UserRepository from '$lib/server/db/repositories/user';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { z } from 'zod/v4';

export type UserProfileData = Awaited<ReturnType<typeof userProfile>>;

// xxx: better schema?
export const userProfile = query(z.string(), async (identifier) => {
	return notFoundIfFalsy(await UserRepository.findProfileByIdentifier(identifier));
});
