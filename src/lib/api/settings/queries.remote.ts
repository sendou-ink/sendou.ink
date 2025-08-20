import { query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import invariant from '$lib/utils/invariant';
import type { UpdateMatchProfileData } from './schemas';
import * as MapPool from '$lib/core/maps/MapPool';

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
		vc: profile.vc,
		languages: (profile.languages?.split(',') ?? []) as UpdateMatchProfileData['languages'],
		modes:
			// xxx: we could handle this better via a migration
			profile.mapModePreferences?.modes.flatMap((pref) =>
				pref.preference === 'PREFER' ? pref.mode : []
			) ?? [],
		maps: profile.mapModePreferences
			? MapPool.fromSendouQMapPoolPreferences(profile.mapModePreferences)
			: MapPool.empty()
	};
});
