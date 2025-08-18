import { query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import invariant from '$lib/utils/invariant';
import type { UpdateMatchProfileData } from './schemas';

export const byLoggedInUser = query(async () => {
	const user = await requireUser();

	return await UserRepository.preferencesById(user.id);
});

export const prefersNoScreen = query(async () => {
	const loggedInUser = await requireUser();

	return { noScreen: await UserRepository.hasNoScreenByUserIds([loggedInUser.id]) };
});

export const matchProfile = query(async (): Promise<UpdateMatchProfileData> => {
	const loggedInUser = await requireUser();

	const profile = await UserRepository.matchProfileById(loggedInUser.id);
	invariant(profile);

	return {
		qWeaponPool: (profile.qWeaponPool ?? []).map((weapon) => ({
			id: weapon.weaponSplId,
			isFavorite: Boolean(weapon.isFavorite)
		})),
		vc: profile.vc
	};
});
