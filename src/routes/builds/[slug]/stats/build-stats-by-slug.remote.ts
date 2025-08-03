import { prerender } from '$app/server';
import { allWeaponSlugs, weaponIdFromSlug } from '../../schemas';
import type { Ability, MainWeaponId } from '$lib/constants/in-game/types';
import { sql } from '$lib/server/db/sql';
import { abilityPointCountsToAverages } from '$lib/core/build/stats';

export const buildStatsBySlug = prerender(
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
		inputs: () => allWeaponSlugs as unknown as MainWeaponId[] // xxx: https://github.com/sveltejs/kit/issues/14083
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
