import { sql } from "~/db/sql";
import type { Ability, MainWeaponId } from "~/modules/in-game-lists";

// TODO: could consider removing private builds from this
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

export function abilitiesByWeaponId(
	weaponSplId: MainWeaponId,
): Array<AbilitiesByWeapon> {
	return (stm.all({ weaponSplId }) as any[]).map((row) => ({
		abilities: JSON.parse(row.abilities),
	}));
}
