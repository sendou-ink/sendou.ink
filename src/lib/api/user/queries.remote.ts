import { query } from '$app/server';
import { getUser, requireUser } from '$lib/server/auth/session';
import * as UserRepository from '$lib/server/db/repositories/user';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { identifier, type EditProfileData } from './schemas';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import invariant from '$lib/utils/invariant';

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

export const editProfileFormData = query(
	identifier,
	async (identifier): Promise<EditProfileData> => {
		const loggedInUser = await requireUser();
		const userProfile = notFoundIfFalsy(await UserRepository.findProfileByIdentifier(identifier));
		if (loggedInUser.id !== userProfile.id) {
			error(403);
		}

		return {
			bio: userProfile.bio,
			customName: userProfile.customName,
			customUrl: userProfile.customUrl,
			hideDiscordUniqueName: !userProfile.showDiscordUniqueName,
			commissionsOpen: Boolean(userProfile.commissionsOpen),
			commissionText: userProfile.commissionText,
			inGameName: userProfile.inGameName,
			battlefy: userProfile.battlefy,
			country: userProfile.country,
			weapons: userProfile.weapons.map((weapon) => ({
				id: weapon.weaponSplId,
				isFavorite: Boolean(weapon.isFavorite)
			})),
			sens: [
				typeof userProfile.motionSens === 'number' ? String(userProfile.motionSens) : null,
				typeof userProfile.stickSens === 'number' ? String(userProfile.stickSens) : null
			],
			favoriteBadges: userProfile.favoriteBadgeIds ?? []
		};
	}
);

export const allBadgesOwnedByMe = query(async () => {
	const loggedInUser = await requireUser();
	const profile = await UserRepository.findProfileByIdentifier(String(loggedInUser.id));

	invariant(profile);

	return profile.badges;
});
