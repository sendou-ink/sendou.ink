import { useSearchParams } from "@remix-run/react";
import {
	type AnalyzedBuild,
	type DAMAGE_TYPE,
	type DamageType,
	buildStats,
	possibleApValues,
	validatedAnyWeaponFromSearchParams,
} from "~/features/build-analyzer";
import { exampleMainWeaponIdWithSpecialWeaponId } from "~/modules/in-game-lists";
import { assertType } from "~/utils/types";
import type { AnyWeapon } from "../build-analyzer/analyzer-types";
import {
	calculateDamage,
	resolveAllUniqueDamageTypes,
} from "./core/objectDamage";

const ABILITY_POINTS_SP_KEY = "ap";
const DAMAGE_TYPE_SP_KEY = "dmg";
const MULTI_SHOT_SP_KEY = "multi";

export function useObjectDamage() {
	const [searchParams, setSearchParams] = useSearchParams();

	const anyWeapon = validatedAnyWeaponFromSearchParams(searchParams);
	const abilityPoints = validatedAbilityPointsFromSearchParams(searchParams);
	const isMultiShot = validatedMultiShotFromSearchParams(searchParams);
	const analyzed = buildStats({
		weaponSplId:
			anyWeapon.type === "MAIN"
				? anyWeapon.id
				: anyWeapon.type === "SPECIAL"
					? exampleMainWeaponIdWithSpecialWeaponId(anyWeapon.id)
					: 0,
		hasTacticooler: false,
	});

	const damageType = validatedDamageTypeFromSearchParams({
		searchParams,
		analyzed,
		anyWeapon,
	});

	const handleChange = ({
		newAnyWeapon = anyWeapon,
		newAbilityPoints = abilityPoints,
		newDamageType = damageType,
		newIsMultiShot = isMultiShot,
	}: {
		newAnyWeapon?: AnyWeapon;
		newAbilityPoints?: number;
		newDamageType?: DamageType;
		newIsMultiShot?: boolean;
	}) => {
		setSearchParams(
			{
				weapon: `${newAnyWeapon.type}_${newAnyWeapon.id}`,
				[ABILITY_POINTS_SP_KEY]: String(newAbilityPoints),
				[DAMAGE_TYPE_SP_KEY]: newDamageType ?? "",
				[MULTI_SHOT_SP_KEY]: String(newIsMultiShot),
			},
			{ replace: true, preventScrollReset: true },
		);
	};

	return {
		weapon: anyWeapon,
		isMultiShot,
		multiShotCount: analyzed.stats.damages.find((d) => d.type === damageType)
			?.multiShots,
		handleChange,
		damagesToReceivers: damageType
			? calculateDamage({
					abilityPoints: new Map([
						["BRU", abilityPoints],
						["SPU", abilityPoints],
					]),
					analyzed,
					anyWeapon,
					damageType,
					isMultiShot,
				})
			: null,
		abilityPoints: String(abilityPoints),
		damageType,
		allDamageTypes: resolveAllUniqueDamageTypes({ analyzed, anyWeapon }),
	};
}

function validatedAbilityPointsFromSearchParams(searchParams: URLSearchParams) {
	const abilityPoints = Number(searchParams.get(ABILITY_POINTS_SP_KEY));

	return (
		possibleApValues().find((possibleAp) => possibleAp === abilityPoints) ?? 0
	);
}

function validatedMultiShotFromSearchParams(searchParams: URLSearchParams) {
	return searchParams.get(MULTI_SHOT_SP_KEY) !== "false";
}

export const damageTypePriorityList = [
	"TURRET_MAX",
	"TURRET_MIN",
	"DIRECT_MAX",
	"DIRECT_SECONDARY_MAX",
	"DIRECT_SECONDARY_MIN",
	"DIRECT",
	"DIRECT_MIN",
	"FULL_CHARGE",
	"MAX_CHARGE",
	"NORMAL_MAX_FULL_CHARGE",
	"NORMAL_MAX",
	"NORMAL_MIN",
	"SPLASH",
	"TAP_SHOT",
	"DISTANCE",
	"WAVE",
	"BOMB_DIRECT",
	"BOMB_NORMAL",
	"SPLATANA_VERTICAL_DIRECT",
	"SPLATANA_VERTICAL",
	"SPLATANA_HORIZONTAL_DIRECT",
	"SPLATANA_HORIZONTAL",
	"SPLASH_MIN",
	"SPLASH_MAX",
	"SPLASH_VERTICAL_MAX",
	"SPLASH_VERTICAL_MIN",
	"SPLASH_HORIZONTAL_MAX",
	"SPLASH_HORIZONTAL_MIN",
	"ROLL_OVER",
	"SPECIAL_MAX_CHARGE",
	"SPECIAL_MIN_CHARGE",
	"SPECIAL_THROW_DIRECT",
	"SPECIAL_THROW",
	"SPECIAL_SWING",
	"SPECIAL_CANNON",
	"SPECIAL_BULLET_MAX",
	"SPECIAL_BULLET_MIN",
	"SPECIAL_BUMP",
	"SPECIAL_JUMP",
	"SPECIAL_TICK",
	"SECONDARY_MODE_MAX",
	"SECONDARY_MODE_MIN",
] as const;
assertType<
	(typeof damageTypePriorityList)[number],
	(typeof DAMAGE_TYPE)[number]
>();

function validatedDamageTypeFromSearchParams({
	searchParams,
	analyzed,
	anyWeapon,
}: {
	searchParams: URLSearchParams;
	analyzed: AnalyzedBuild;
	anyWeapon: AnyWeapon;
}) {
	const damages =
		anyWeapon.type === "SPECIAL"
			? analyzed.stats.specialWeaponDamages
			: analyzed.stats.damages;
	const damageType = searchParams.get(DAMAGE_TYPE_SP_KEY);

	const found = damages.find((d) => d.type === damageType);

	if (found) return found.type;

	const fallbackFound = damageTypePriorityList.find((type) =>
		damages.some((d) => d.type === type),
	);

	return fallbackFound;
}
