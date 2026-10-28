import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort } from "~/utils/schema";
import { abilityFiltersSchema, buildsDateFilterSchema } from "./builds-schemas";
import type { AbilityFilter } from "./builds-types";

/** e.g. `ISM-min12.SSU-max6.LDE.CB-not` */
const abilityFiltersCodec = SearchParams.codec(abilityFiltersSchema, {
	decode: (encoded) => encoded.split(".").map(decodeAbilityFilter),
	encode: (filters) => filters.map(encodeAbilityFilter).join("."),
});

/** Params of a filtered, paginated build list, shared by the weapon and user build pages. */
export const buildListParams = {
	page: SP.page(),
	abilities: SP.custom(abilityFiltersCodec, {
		default: [],
		resets: ["page"],
		loader: true,
	}),
	mode: SP.param(v.nullable(modeShort), {
		resets: ["page"],
		loader: true,
	}),
	date: SP.param(v.nullable(buildsDateFilterSchema), {
		resets: ["page"],
		loader: true,
	}),
};

export const buildsSearchParams = SearchParams.define(buildListParams);

function decodeAbilityFilter(token: string) {
	const [ability, condition, ...rest] = token.split("-");
	if (rest.length > 0) return undefined;

	if (condition === undefined) return { type: "HAS", ability };
	if (condition === "not") return { type: "HAS_NOT", ability };

	const match = /^(min|max)(\d+)$/.exec(condition);
	if (!match) return undefined;

	return {
		type: match[1] === "min" ? "AT_LEAST" : "AT_MOST",
		ability,
		ap: Number(match[2]),
	};
}

function encodeAbilityFilter(filter: AbilityFilter) {
	switch (filter.type) {
		case "HAS":
			return filter.ability;
		case "HAS_NOT":
			return `${filter.ability}-not`;
		case "AT_LEAST":
			return `${filter.ability}-min${filter.ap}`;
		case "AT_MOST":
			return `${filter.ability}-max${filter.ap}`;
	}
}
