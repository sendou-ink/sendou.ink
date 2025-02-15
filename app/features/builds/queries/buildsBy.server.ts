import { sql } from "~/db/sql";
import type {
	Build,
	BuildAbility,
	BuildWeapon,
	UserWithPlusTier,
} from "~/db/types";
import { type ModeShort, weaponIdToAltId } from "~/modules/in-game-lists";
import type {
	BuildAbilitiesTuple,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { sortAbilities } from "../core/ability-sorting.server";

const buildsByWeaponIdStm = sql.prepare(/* sql */ `
with "Top500Weapon" as (
  select
    "BuildWeapon".*,
    min("XRankPlacement"."rank") as "minRank",
    max("XRankPlacement"."power") as "maxPower",
    (
      (
        "BuildWeapon"."weaponSplId" = @weaponId
        or "BuildWeapon"."weaponSplId" = @altWeaponId
        or "BuildWeapon"."weaponSplId" = @altWeaponIdTwo
      )
      and "XRankPlacement"."rank" is not null
    ) as "relevant"
  from
    "BuildWeapon"
    left join "Build" on "Build"."id" = "BuildWeapon"."buildId"
    left join "SplatoonPlayer" on "SplatoonPlayer"."userId" = "Build"."ownerId"
    left join "XRankPlacement" on "XRankPlacement"."playerId" = "SplatoonPlayer"."id"
    and "XRankPlacement"."weaponSplId" = "BuildWeapon"."weaponSplId"
  group by
    "BuildWeapon"."buildId",
    "BuildWeapon"."weaponSplId"
),
"BuildFiltered" as (
  select
    "id",
    "title",
    "description",
    "modes",
    "headGearSplId",
    "clothesGearSplId",
    "shoesGearSplId",
    "updatedAt",
    "ownerId",
    max("Top500Weapon"."relevant") as "isTop500"
  from
    "Build"
    left join "Top500Weapon" on "Top500Weapon"."buildId" = "Build"."id"
  where
    (
      "Top500Weapon"."weaponSplId" = @weaponId
      or "Top500Weapon"."weaponSplId" = @altWeaponId
    )
    and "Build"."private" = 0
  group by
    "Build"."id"
),
"BuildWithWeapon" as (
  select
    "BuildFiltered".*,
    json_group_array(
      json_object(
        'weaponSplId',
        "Top500Weapon"."weaponSplId",
        'maxPower',
        "Top500Weapon"."maxPower",
        'minRank',
        "Top500Weapon"."minRank"
      )
    ) as "weapons"
  from
    "BuildFiltered"
    left join "Top500Weapon" on "Top500Weapon"."buildId" = "BuildFiltered"."id"
  group by
    "BuildFiltered"."id"
)
select
  "BuildWithWeapon".*,
  "User"."discordId",
  "User"."username",
  "PlusTier"."tier" as "plusTier",
  json_group_array(
    json_object(
      'ability',
      "BuildAbility"."ability",
      'gearType',
      "BuildAbility"."gearType",
      'slotIndex',
      "BuildAbility"."slotIndex"
    )
  ) as "abilities"
from
  "BuildWithWeapon"
  left join "BuildAbility" on "BuildAbility"."buildId" = "BuildWithWeapon"."id"
  left join "PlusTier" on "PlusTier"."userId" = "BuildWithWeapon"."ownerId"
  left join "User" on "User"."id" = "BuildWithWeapon"."ownerId"
group by
  "BuildWithWeapon"."id"
order by
  case
    when "PlusTier"."tier" is null then 4
    else "PlusTier"."tier"
  end asc,
  "BuildWithWeapon"."isTop500" desc,
  "BuildWithWeapon"."updatedAt" desc
limit
  @limit
`);

type BuildsByWeaponIdRow = BuildsByUserRow &
	Pick<UserWithPlusTier, "discordId" | "username" | "plusTier">;

export function buildsByWeaponId({
	weaponId,
	limit,
}: {
	weaponId: BuildWeapon["weaponSplId"];
	limit: number;
}) {
	const [altWeaponId, altWeaponIdTwo] = (() => {
		const alts = weaponIdToAltId.get(weaponId);
		// default to impossible weapon id so we can always have same amount of placeholder values
		if (!alts) return [-1, -1];
		if (typeof alts === "number") return [alts, -1];

		invariant(alts.length === 2, "expected 2 alts");
		return alts;
	})();

	const rows = buildsByWeaponIdStm.all({
		weaponId,
		altWeaponId,
		altWeaponIdTwo,
		limit,
	}) as Array<BuildsByWeaponIdRow>;

	return rows.map(augmentBuild);
}

type BuildsByUserRow = Pick<
	Build,
	| "id"
	| "title"
	| "description"
	| "modes"
	| "headGearSplId"
	| "clothesGearSplId"
	| "shoesGearSplId"
	| "updatedAt"
	| "private"
> & {
	weapons: string;
	abilities: string;
};

export interface BuildWeaponWithTop500Info {
	weaponSplId: MainWeaponId;
	minRank: number | null;
	maxPower: number | null;
}

function augmentBuild<T>({
	weapons: rawWeapons,
	modes: rawModes,
	abilities: rawAbilities,
	...row
}: T & { modes: Build["modes"]; weapons: string; abilities: string }) {
	const modes = rawModes ? (JSON.parse(rawModes) as ModeShort[]) : null;
	const weapons = (
		JSON.parse(rawWeapons) as Array<BuildWeaponWithTop500Info>
	).sort((a, b) => a.weaponSplId - b.weaponSplId);
	const abilities = dbAbilitiesToArrayOfArrays(
		JSON.parse(rawAbilities) as Array<
			Pick<BuildAbility, "ability" | "gearType" | "slotIndex">
		>,
	);

	return {
		...row,
		modes,
		weapons,
		abilities: sortAbilities(abilities),
		unsortedAbilities: abilities,
	};
}

const gearOrder: Array<BuildAbility["gearType"]> = ["HEAD", "CLOTHES", "SHOES"];
function dbAbilitiesToArrayOfArrays(
	abilities: Array<Pick<BuildAbility, "ability" | "gearType" | "slotIndex">>,
): BuildAbilitiesTuple {
	const sorted = abilities
		.slice()
		.sort((a, b) => {
			if (a.gearType === b.gearType) return a.slotIndex - b.slotIndex;

			return gearOrder.indexOf(a.gearType) - gearOrder.indexOf(b.gearType);
		})
		.map((a) => a.ability);

	invariant(sorted.length === 12, "expected 12 abilities");

	return [
		[sorted[0], sorted[1], sorted[2], sorted[3]],
		[sorted[4], sorted[5], sorted[6], sorted[7]],
		[sorted[8], sorted[9], sorted[10], sorted[11]],
	];
}
