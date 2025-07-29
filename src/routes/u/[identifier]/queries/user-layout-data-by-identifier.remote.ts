import { query } from '$app/server';
import { getUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { z } from 'zod/v4';

// xxx: better schema?
export const userLayoutDataByIdentifier = query(z.string(), async (identifier) => {
	const loggedInUser = await getUser();

	const user = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(identifier, loggedInUser?.id)
	);

	return {
		user: {
			...user,
			css: undefined
		},
		css: user.css
	};
});
