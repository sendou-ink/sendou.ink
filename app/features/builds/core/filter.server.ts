import type { Tables } from "~/db/tables";
import { buildToAbilityPoints } from "~/features/build-analyzer/core/ability-points";
import type {
	BuildAbilitiesTuple,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import type { AbilityCondition } from "../builds-types";

type PartialBuild = {
	abilities: BuildAbilitiesTuple;
	modes: ModeShort[] | null;
	updatedAt: Tables["Build"]["updatedAt"];
};

interface BuildFilters {
	abilities: AbilityCondition[];
	mode: ModeShort | null;
	date: string | null;
}

/** Up to `count` builds matching every filter (AND). */
export function filterBuilds<T extends PartialBuild>({
	abilities,
	mode,
	date,
	count,
	builds,
}: BuildFilters & {
	count: number;
	builds: T[];
}) {
	const result: T[] = [];

	for (const build of builds) {
		if (result.length === count) break;

		if (buildMatchesFilters({ build, abilities, mode, date })) {
			result.push(build);
		}
	}

	return result;
}

function buildMatchesFilters<T extends PartialBuild>({
	build,
	abilities,
	mode,
	date,
}: BuildFilters & { build: T }) {
	for (const condition of abilities) {
		if (!matchesAbilityCondition({ build, condition })) return false;
	}

	if (mode !== null && !matchesModeFilter({ build, mode })) return false;
	if (date !== null && !matchesDateFilter({ build, date })) return false;

	return true;
}

function matchesAbilityCondition({
	build,
	condition,
}: {
	build: PartialBuild;
	condition: AbilityCondition;
}) {
	if (typeof condition.value === "boolean") {
		const hasAbility = build.abilities.flat().includes(condition.ability);
		if (condition.value && !hasAbility) return false;
		if (!condition.value && hasAbility) return false;
	} else if (typeof condition.value === "number") {
		const abilityPoints = buildToAbilityPoints(build.abilities);
		const ap = abilityPoints.get(condition.ability) ?? 0;
		if (condition.comparison === "AT_LEAST" && ap < condition.value)
			return false;
		if (condition.comparison === "AT_MOST" && ap > condition.value)
			return false;
	}

	return true;
}

function matchesModeFilter({
	build,
	mode,
}: {
	build: PartialBuild;
	mode: ModeShort;
}) {
	if (!build.modes) return false;

	return build.modes.includes(mode);
}

function matchesDateFilter({
	build,
	date,
}: {
	build: PartialBuild;
	date: string;
}) {
	return new Date(date) < databaseTimestampToDate(build.updatedAt);
}
