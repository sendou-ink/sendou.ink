import { useSearchParams } from "@remix-run/react";
import {
	type Ability,
	type AbilityWithUnknown,
	type BuildAbilitiesTupleWithUnknown,
	type MainWeaponId,
	abilities,
	isAbility,
} from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";
import { MAX_LDE_INTENSITY } from "./analyzer-constants";
import type { SpecialEffectType } from "./analyzer-types";
import { SPECIAL_EFFECTS, applySpecialEffects } from "./core/specialEffects";
import { buildStats } from "./core/stats";
import {
	buildIsEmpty,
	buildToAbilityPoints,
	serializeBuild,
	validatedBuildFromSearchParams,
	validatedWeaponIdFromSearchParams,
} from "./core/utils";

export function useAnalyzeBuild() {
	const [searchParams, setSearchParams] = useSearchParams();

	const mainWeaponId = validatedWeaponIdFromSearchParams(searchParams);
	const build = validatedBuildFromSearchParams(searchParams);
	const build2 = validatedBuildFromSearchParams(searchParams, "build2", build);
	const ldeIntensity = validatedLdeIntensityFromSearchParams(searchParams);
	const effects = validatedEffectsFromSearchParams({ searchParams, build });
	const effects2 = validatedEffectsFromSearchParams({
		searchParams,
		build: build2,
	});
	const focused = validatedFocusedFromSearchParams({ searchParams });

	invariant(
		!(buildIsEmpty(build) && !buildIsEmpty(build2)),
		"build1 is empty but build2 isn't",
	);

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
		setSearchParams(
			{
				weapon: String(newMainWeaponId),
				build: serializeBuild(newBuild),
				build2: serializeBuild(newBuild2),
				lde: String(newLdeIntensity),
				effect: newEffects,
				focused: String(newFocused),
			},
			{ replace: true, preventScrollReset: true },
		);
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

function validatedLdeIntensityFromSearchParams(searchParams: URLSearchParams) {
	const ldeIntensity = searchParams.get("lde")
		? Number(searchParams.get("lde"))
		: null;

	if (
		!ldeIntensity ||
		!Number.isInteger(ldeIntensity) ||
		ldeIntensity < 0 ||
		ldeIntensity > MAX_LDE_INTENSITY
	) {
		return 0;
	}

	return ldeIntensity;
}

function validatedEffectsFromSearchParams({
	searchParams,
	build,
}: {
	searchParams: URLSearchParams;
	build: BuildAbilitiesTupleWithUnknown;
}) {
	const result: Array<SpecialEffectType> = [];

	const effects = searchParams.getAll("effect");
	const effectsNoDuplicates = [...new Set(effects)];
	const abilities = build.flat();

	for (const effect of effectsNoDuplicates) {
		const effectObj = SPECIAL_EFFECTS.find((e) => e.type === effect);
		if (!effectObj) continue;

		// e.g. even if OG effect is active in state
		// it can't be on unless build has OG
		if (isAbility(effect) && !abilities.includes(effect)) {
			continue;
		}

		result.push(effect as SpecialEffectType);
	}

	// lde is a special case in that it's always
	// considered active when in the build
	if (abilities.includes("LDE") && !result.includes("LDE")) {
		result.push("LDE");
	}

	return result;
}

function validatedFocusedFromSearchParams({
	searchParams,
}: {
	searchParams: URLSearchParams;
}) {
	const focused = searchParams.get("focused");

	if (focused === "2") return 2;
	if (focused === "3") return 3;

	return 1;
}
