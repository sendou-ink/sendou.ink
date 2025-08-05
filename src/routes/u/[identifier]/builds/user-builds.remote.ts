import * as BuildRepository from '$lib/server/db/repositories/build';
import * as UserRepository from '$lib/server/db/repositories/user';
import { getUser } from '$lib/server/auth/session';
import { z } from 'zod/v4';
import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { sortBuilds } from './build-sorting';
import type { MainWeaponId } from '$lib/constants/in-game/types';
import { sortAbilities } from '$lib/core/build/ability-sorting';

export type UserBuildsData = Awaited<ReturnType<typeof userBuilds>>;

// xxx: better schema?
export const userBuilds = query(z.string(), async (identifier) => {
	const loggedInUser = await getUser();
	const user = notFoundIfFalsy(await UserRepository.identifierToBuildFields(identifier));

	const builds = await BuildRepository.allByUserId({
		userId: user.id,
		showPrivate: loggedInUser?.id === user.id
	});

	if (builds.length === 0 && loggedInUser?.id !== user.id) error(404);

	const sortedBuilds = sortBuilds({
		builds,
		buildSorting: user.buildSorting,
		weaponPool: user.weapons
	}).map((build) => ({
		...build,
		abilities: sortAbilities(build.abilities),
		unsortedAbilities: build.abilities
	}));

	return {
		buildSorting: user.buildSorting,
		builds: sortedBuilds,
		weaponCounts: calculateWeaponCounts()
	};

	function calculateWeaponCounts() {
		return builds.reduce(
			(acc, build) => {
				for (const weapon of build.weapons) {
					acc[weapon.weaponSplId] = (acc[weapon.weaponSplId] ?? 0) + 1;
				}

				return acc;
			},
			{} as Record<MainWeaponId, number>
		);
	}
});
