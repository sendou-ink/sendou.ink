import * as v from "valibot";
import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { isStackableAbility } from "~/features/build-analyzer/core/ability-points";
import { ability } from "~/utils/schema";
import { MAX_BUILD_FILTERS, RECENT_PATCHES } from "./builds-constants";

const abilityFilterSchema = v.union([
	v.object({
		type: v.picklist(["HAS", "HAS_NOT"]),
		ability,
	}),
	v.object({
		type: v.picklist(["AT_LEAST", "AT_MOST"]),
		ability: v.pipe(
			ability,
			v.check((value) => isStackableAbility(value)),
		),
		ap: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_AP)),
	}),
]);

export const abilityFiltersSchema = v.pipe(
	v.array(abilityFilterSchema),
	v.maxLength(MAX_BUILD_FILTERS),
	v.check(
		(filters) =>
			new Set(filters.map((filter) => filter.ability)).size === filters.length,
	),
);

export const buildsDateFilterSchema = v.picklist(
	RECENT_PATCHES.map((patch) => patch.date),
);
