import { prerender } from '$app/server';
import { allWeaponSlugs, weaponIdFromSlug } from '../../schemas';
import type { Ability, MainWeaponId } from '$lib/constants/in-game/types';
import { sql } from '$lib/server/db/sql';
import { popularBuilds } from '$lib/core/build/stats';

export const popularAbilitiesBySlug = prerender(
	weaponIdFromSlug,
	async (weaponId) => {
		return { weaponId, popular: popularBuilds(abilitiesByWeaponId(weaponId)) };
	},
	{
		inputs: () => allWeaponSlugs as unknown as MainWeaponId[] // xxx: https://github.com/sveltejs/kit/issues/14083
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
