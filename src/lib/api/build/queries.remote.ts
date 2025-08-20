import * as BuildRepository from '$lib/server/db/repositories/build';
import * as UserRepository from '$lib/server/db/repositories/user';
import { getUser } from '$lib/server/auth/session';
import { z } from 'zod/v4';
import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { DEFAULT_BUILD_SORT, sortBuilds } from '$lib/core/build/build-sorting';
import { BUILDS_PAGE_MAX_BUILDS } from '$lib/constants/build';
import * as R from 'remeda';
import { filterBuilds } from '$lib/core/build/filter';
import { allWeaponSlugs, filtersSearchParams, weaponIdFromSlug } from './schemas';
import { prerender } from '$app/server';
import type { Ability, MainWeaponId } from '$lib/constants/in-game/types';
import { abilityPointCountsToAverages, popularBuilds } from '$lib/core/build/stats';
import * as UserAPI from '../user';

export type ByUserIdentifierData = Awaited<ReturnType<typeof byUserIdentifier>>;

export const byUserIdentifier = query(UserAPI.schemas.identifier, async (identifier) => {
	const loggedInUser = await getUser();
	const user = notFoundIfFalsy(await UserRepository.identifierToBuildFields(identifier));

	const builds = await BuildRepository.allByUserId(user.id, {
		sortAbilities:
			!loggedInUser?.preferences?.disableBuildAbilitySorting && loggedInUser?.id !== user.id,
		showPrivate: loggedInUser?.id === user.id
	});

	if (builds.length === 0 && loggedInUser?.id !== user.id) error(404);

	const sortedBuilds = sortBuilds({
		builds,
		buildSorting: user.buildSorting,
		weaponPool: user.weapons
	});

	return {
		buildSorting: user.buildSorting ?? [...DEFAULT_BUILD_SORT],
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

export type BySlugData = Awaited<ReturnType<typeof bySlug>>;

export const bySlug = query(
	z.object({
		slug: weaponIdFromSlug,
		limit: z
			.number()
			.int()
			.refine((value) => R.clamp(value, { min: 1, max: BUILDS_PAGE_MAX_BUILDS })),
		filters: filtersSearchParams.catch([])
	}),
	async ({ slug: weaponId, limit, filters }) => {
		const loggedInUser = await getUser();
		const builds = await BuildRepository.allByWeaponId(weaponId, {
			limit: limit + 1,
			sortAbilities: !loggedInUser?.preferences?.disableBuildAbilitySorting
		});

		const filteredBuilds =
			filters.length > 0
				? filterBuilds({
						builds,
						filters,
						count: limit
					})
				: builds.slice(0, limit);

		return {
			builds: filteredBuilds.slice(0, limit),
			weaponId,
			hasMore: builds.length === limit + 1 && limit < BUILDS_PAGE_MAX_BUILDS
		};
	}
);

// we only need to load this once (build speed optimization)
const allAbilitiesStatsPromise = BuildRepository.abilityPointAverages();

export const statsBySlug = prerender(
	weaponIdFromSlug,
	async (weaponId) => {
		return {
			weaponId,
			stats: abilityPointCountsToAverages({
				allAbilities: await allAbilitiesStatsPromise,
				weaponAbilities: await BuildRepository.abilityPointAverages(weaponId)
			})
		};
	},
	{
		inputs: () => allWeaponSlugs
	}
);

export interface AverageAbilityPointsResult {
	ability: Ability;
	abilityPointsSum: number;
}

export const popularAbilitiesBySlug = prerender(
	weaponIdFromSlug,
	async (weaponId) => {
		return {
			weaponId,
			popular: popularBuilds(await BuildRepository.popularAbilitiesByWeaponId(weaponId))
		};
	},
	{
		inputs: () => allWeaponSlugs
	}
);

export interface AbilitiesByWeapon {
	abilities: Array<{
		ability: Ability;
		abilityPoints: number;
	}>;
}
