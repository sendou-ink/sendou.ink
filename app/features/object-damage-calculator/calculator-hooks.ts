import { exampleMainWeaponIdWithSpecialWeaponId } from "~/modules/in-game-lists/weapon-ids";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { assertType } from "~/utils/types";
import type { DAMAGE_TYPE } from "../build-analyzer/analyzer-constants";
import type {
	AnalyzedBuild,
	AnyWeapon,
	DamageType,
} from "../build-analyzer/analyzer-types";
import { buildStats } from "../build-analyzer/core/stats";
import { calculatorSearchParams } from "./calculator-search-params";
import {
	calculateDamage,
	resolveAllUniqueDamageTypes,
} from "./core/objectDamage";

export function useObjectDamage() {
	const [params, setParams] = useSearchParamsTyped(calculatorSearchParams);

	const anyWeapon = params.weapon;
	const abilityPoints = params.ap;
	const isMultiShot = params.multi;
	const analyzed = buildStats({
		weaponSplId:
			anyWeapon.type === "MAIN"
				? anyWeapon.id
				: anyWeapon.type === "SPECIAL"
					? exampleMainWeaponIdWithSpecialWeaponId(anyWeapon.id)
					: 0,
		hasTacticooler: false,
	});

	const damageType = validatedDamageType({
		dmg: params.dmg,
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
		setParams({
			weapon: newAnyWeapon,
			ap: newAbilityPoints,
			dmg: newDamageType ?? null,
			multi: newIsMultiShot,
		});
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

const damageTypePriorityList = [
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
	"SPECIAL_SPLASH_MAX",
	"SPECIAL_SPLASH_MIN",
	"SPECIAL_BUMP",
	"SPECIAL_JUMP",
	"SPECIAL_TICK",
	"SECONDARY_MODE_MAX",
	"SECONDARY_MODE_MIN",
	"COMBO",
] as const;
assertType<
	(typeof damageTypePriorityList)[number],
	(typeof DAMAGE_TYPE)[number]
>();

function validatedDamageType({
	dmg,
	analyzed,
	anyWeapon,
}: {
	dmg: DamageType | null;
	analyzed: AnalyzedBuild;
	anyWeapon: AnyWeapon;
}) {
	const damages =
		anyWeapon.type === "SPECIAL"
			? analyzed.stats.specialWeaponDamages
			: analyzed.stats.damages;

	const found = damages.find((d) => d.type === dmg);

	if (found) return found.type;

	const fallbackFound = damageTypePriorityList.find((type) =>
		damages.some((d) => d.type === type),
	);

	return fallbackFound;
}
