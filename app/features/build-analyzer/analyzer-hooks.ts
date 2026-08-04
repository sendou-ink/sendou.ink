import { EMPTY_BUILD } from "~/features/builds/builds-constants";
import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability,
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { isAbility } from "~/modules/in-game-lists/utils";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { analyzerSearchParams } from "./analyzer-search-params";
import type { SpecialEffectType } from "./analyzer-types";
import { applySpecialEffects, SPECIAL_EFFECTS } from "./core/specialEffects";
import { buildStats } from "./core/stats";
import { buildIsEmpty, buildToAbilityPoints } from "./core/utils";

export function useAnalyzeBuild() {
	const [params, setParams] = useSearchParamsTyped(analyzerSearchParams);

	const mainWeaponId = params.weapon;
	const build = params.build;
	const build2 = buildIsEmpty(build) ? EMPTY_BUILD : params.build2;
	const ldeIntensity = params.lde;
	const effects = validatedEffects({ effects: params.effect, build });
	const effects2 = validatedEffects({
		effects: params.effect,
		build: build2,
	});
	const focused = params.focused;

	const handleChange = ({
		newMainWeaponId = mainWeaponId,
		newBuild = build,
		newBuild2 = build2,
		newLdeIntensity = ldeIntensity,
		newEffects = effects,
		newFocused = focused,
	}: {
		newMainWeaponId?: MainWeaponId;
		newBuild?: BuildAbilitiesTupleWithUnknown;
		newBuild2?: BuildAbilitiesTupleWithUnknown;
		newLdeIntensity?: number;
		newEffects?: Array<SpecialEffectType>;
		newFocused?: 1 | 2 | 3;
	}) => {
		setParams({
			weapon: newMainWeaponId,
			build: newBuild,
			build2: newBuild2,
			lde: newLdeIntensity,
			effect: newEffects,
			focused: newFocused,
		});
	};

	const buildAbilityPoints = buildToAbilityPoints(build);
	const abilityPoints = applySpecialEffects({
		abilityPoints: buildAbilityPoints,
		effects,
		ldeIntensity,
	});
	const hasTacticooler = effects.includes("TACTICOOLER");
	const analyzed = buildStats({
		abilityPoints,
		weaponSplId: mainWeaponId,
		mainOnlyAbilities: build
			.map((row) => row[0])
			.filter(filterMainOnlyAbilities),
		hasTacticooler,
	});

	const buildAbilityPoints2 = buildToAbilityPoints(build2);
	const abilityPoints2 = applySpecialEffects({
		abilityPoints: buildAbilityPoints2,
		effects: effects2,
		ldeIntensity,
	});
	const analyzed2 = buildStats({
		abilityPoints: abilityPoints2,
		weaponSplId: mainWeaponId,
		mainOnlyAbilities: build2
			.map((row) => row[0])
			.filter(filterMainOnlyAbilities),
		hasTacticooler,
	});

	return {
		build,
		build2,
		focusedBuild: focused === 1 ? build : focused === 2 ? build2 : null,
		focused,
		mainWeaponId,
		handleChange,
		analyzed,
		analyzed2,
		abilityPoints,
		abilityPoints2,
		allEffects: Array.from(new Set([...effects, ...effects2])),
		ldeIntensity,
	};
}

function filterMainOnlyAbilities(
	ability: AbilityWithUnknown,
): ability is Ability {
	const abilityObj = abilities.find((a) => a.name === ability);
	return Boolean(abilityObj && abilityObj.type !== "STACKABLE");
}

function validatedEffects({
	effects,
	build,
}: {
	effects: Array<SpecialEffectType>;
	build: BuildAbilitiesTupleWithUnknown;
}) {
	const result: Array<SpecialEffectType> = [];

	const effectsNoDuplicates = [...new Set(effects)];
	const buildAbilities = build.flat();

	for (const effect of effectsNoDuplicates) {
		const effectObj = SPECIAL_EFFECTS.find((e) => e.type === effect);
		if (!effectObj) continue;

		// e.g. even if OG effect is active in state
		// it can't be on unless build has OG
		if (isAbility(effect) && !buildAbilities.includes(effect)) {
			continue;
		}

		result.push(effect);
	}

	// lde is a special case in that it's always
	// considered active when in the build
	if (buildAbilities.includes("LDE") && !result.includes("LDE")) {
		result.push("LDE");
	}

	return result;
}
