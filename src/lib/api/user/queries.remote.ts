import { query } from '$app/server';
import { getUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { identifier } from './schemas';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const layoutDataByIdentifier = query(identifier, async (identifier) => {
	const loggedInUser = await getUser();

	const data = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(identifier, loggedInUser?.id)
	);

	if (data.user.customUrl && identifier !== data.user.customUrl) {
		redirect(302, resolve(`/u/${data.user.customUrl}`));
	}

	return data;
});

export type ProfileByIdentifierData = Awaited<ReturnType<typeof profileByIdentifier>>;

export const profileByIdentifier = query(identifier, async (identifier) => {
	return notFoundIfFalsy(await UserRepository.findProfileByIdentifier(identifier));
});
