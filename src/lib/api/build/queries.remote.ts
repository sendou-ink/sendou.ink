import * as BuildRepository from '$lib/server/db/repositories/build';
import * as UserRepository from '$lib/server/db/repositories/user';
import { getUser } from '$lib/server/auth/session';
import { z } from 'zod/v4';
import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { sortAbilities } from '$lib/core/build/ability-sorting';
import { sortBuilds } from '$lib/core/build/build-sorting';
import { BUILDS_PAGE_MAX_BUILDS } from '$lib/constants/build';
import * as R from 'remeda';
import { filterBuilds } from '$lib/core/build/filter';
import { cachedBuildsByWeaponId } from '../../../routes/builds/[slug]/cached-builds.server';
import { allWeaponSlugs, filtersSearchParams, weaponIdFromSlug } from './schemas';
import { prerender } from '$app/server';
import type { Ability, MainWeaponId } from '$lib/constants/in-game/types';
import { sql } from '$lib/server/db/sql';
import { abilityPointCountsToAverages, popularBuilds } from '$lib/core/build/stats';

export type ByUserIdentifierData = Awaited<ReturnType<typeof byUserIdentifier>>;

// xxx: better schema?
export const byUserIdentifier = query(z.string(), async (identifier) => {
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
		const cachedBuilds = cachedBuildsByWeaponId(weaponId);

		const filteredBuilds =
			filters.length > 0
				? filterBuilds({
						builds: cachedBuilds,
						filters,
						count: limit
					})
				: cachedBuilds.slice(0, limit);

		return {
			builds: filteredBuilds,
			weaponId,
			hasMore: cachedBuilds.length > filteredBuilds.length
			// filters: filters.success ? filters.data : [],
		};
	}
);

export const statsBySlug = prerender(
	weaponIdFromSlug,
	async (weaponId) => {
		return {
			weaponId,
			stats: abilityPointCountsToAverages({
				allAbilities: averageAbilityPoints(),
				weaponAbilities: averageAbilityPoints(weaponId)
			})
		};
	},
	{
		inputs: () => allWeaponSlugs
	}
);

// TODO: convert to Kysely
// TODO: exclude private builds
function sqlQuery(includeWeaponId: boolean) {
	return /* sql */ `
	select "BuildAbility"."ability", sum("BuildAbility"."abilityPoints") as "abilityPointsSum"
	from "BuildAbility"
	left join "BuildWeapon" on "BuildAbility"."buildId" = "BuildWeapon"."buildId"
	${includeWeaponId ? /* sql */ `where "BuildWeapon"."weaponSplId" = @weaponSplId` : ''}
	group by "BuildAbility"."ability"
`;
}

const findByWeaponIdStm = sql.prepare(sqlQuery(true));
const findAllStm = sql.prepare(sqlQuery(false));

export interface AverageAbilityPointsResult {
	ability: Ability;
	abilityPointsSum: number;
}

function averageAbilityPoints(weaponSplId?: MainWeaponId | null) {
	const stm = typeof weaponSplId === 'number' ? findByWeaponIdStm : findAllStm;

	return stm.all({
		weaponSplId: weaponSplId ?? null
	}) as Array<AverageAbilityPointsResult>;
}

export const popularAbilitiesBySlug = prerender(
	weaponIdFromSlug,
	async (weaponId) => {
		return { weaponId, popular: popularBuilds(abilitiesByWeaponId(weaponId)) };
	},
	{
		inputs: () => allWeaponSlugs
	}
);

// TODO: convert to Kysely
// TODO: exclude private builds
const stm = sql.prepare(/* sql */ `
	with "GroupedAbilities" as (
		select 
			json_group_array(
				json_object(
					'ability',
					"BuildAbility"."ability",
					'abilityPoints',
					"BuildAbility"."abilityPoints"
				)
			) as "abilities",
			"Build"."ownerId"
		from "BuildAbility"
		left join "BuildWeapon" on "BuildWeapon"."buildId" = "BuildAbility"."buildId"
		left join "Build" on "Build"."id" = "BuildWeapon"."buildId"
		where "BuildWeapon"."weaponSplId" = @weaponSplId
		group by "BuildAbility"."buildId"
	)
	-- group by owner id so every user gets one build considered
	select "abilities" 
		from "GroupedAbilities"
		group by "ownerId"
`);

export interface AbilitiesByWeapon {
	abilities: Array<{
		ability: Ability;
		abilityPoints: number;
	}>;
}

function abilitiesByWeaponId(weaponSplId: MainWeaponId): Array<AbilitiesByWeapon> {
	return (stm.all({ weaponSplId }) as any[]).map((row) => ({
		abilities: JSON.parse(row.abilities)
	}));
}
