import type { Ability, BuildAbilitiesTuple, ModeShort } from '$lib/constants/in-game/types';
import type { Tables } from '$lib/server/db/tables';
import { assertUnreachable } from '$lib/utils/types';
import type { BuildFiltersFromSearchParams } from './schemas';

type PartialBuild = {
	abilities: BuildAbilitiesTuple;
	modes: ModeShort[] | null;
	updatedAt: Tables['Build']['updatedAt'];
};

type WithId<T> = T & { id: string };

export type AbilityBuildFilter = WithId<{
	type: 'ability';
	ability: Ability;
	/** Ability points value or "has"/"doesn't have" */
	value?: number | boolean;
	comparison?: 'AT_LEAST' | 'AT_MOST';
}>;

export type ModeBuildFilter = WithId<{
	type: 'mode';
	mode: ModeShort;
}>;

export type DateBuildFilter = WithId<{
	type: 'date';
	/** YYYY-MM-DD */
	date: string;
}>;

export type BuildFilter = AbilityBuildFilter | ModeBuildFilter | DateBuildFilter;

/**
 * Filters an array of builds based on the provided filter criteria and returns up to a specified count of matching builds.
 *
 * Filters are applied on "AND" basis, meaning all filters must match for a build to be included in the result.
 */
export function filterBuilds<T extends PartialBuild>({
	filters,
	count,
	builds
}: {
	filters: BuildFiltersFromSearchParams;
	count: number;
	builds: T[];
}) {
	const result: T[] = [];

	for (const build of builds) {
		if (result.length === count) break;

		if (buildMatchesFilters({ build, filters })) {
			result.push(build);
		}
	}

	return result;
}

function buildMatchesFilters<T extends PartialBuild>({
	build,
	filters
}: {
	build: T;
	filters: BuildFiltersFromSearchParams;
}) {
	for (const filter of filters) {
		if (filter.type === 'ability') {
			if (!matchesAbilityFilter({ build, filter })) return false;
		} else if (filter.type === 'mode') {
			if (!matchesModeFilter({ build, filter })) return false;
		} else if (filter.type === 'date') {
			if (!matchesDateFilter({ build, filter })) return false;
		} else {
			assertUnreachable(filter);
		}
	}

	return true;
}

function matchesAbilityFilter({
	build,
	filter
}: {
	build: PartialBuild;
	filter: Omit<AbilityBuildFilter, 'id'>;
}) {
	if (typeof filter.value === 'boolean') {
		const hasAbility = build.abilities.flat().includes(filter.ability);
		if (filter.value && !hasAbility) return false;
		if (!filter.value && hasAbility) return false;
	} else if (typeof filter.value === 'number') {
		const abilityPoints = buildToAbilityPoints(build.abilities);
		const ap = abilityPoints.get(filter.ability) ?? 0;
		if (filter.comparison === 'AT_LEAST' && ap < filter.value) return false;
		if (filter.comparison === 'AT_MOST' && ap > filter.value) return false;
	}

	return true;
}

function matchesModeFilter({
	build,
	filter
}: {
	build: PartialBuild;
	filter: Omit<ModeBuildFilter, 'id'>;
}) {
	if (!build.modes) return false;

	return build.modes.includes(filter.mode);
}

function matchesDateFilter({
	build,
	filter
}: {
	build: PartialBuild;
	filter: Omit<DateBuildFilter, 'id'>;
}) {
	const date = new Date(filter.date);

	return date < build.updatedAt;
}

// xxx: mock
function buildToAbilityPoints(_abilities: BuildAbilitiesTuple) {
	return new Map<any, any>();
}
