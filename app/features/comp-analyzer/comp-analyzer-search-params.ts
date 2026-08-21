import * as v from "valibot";
import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/schema";
import { MAX_WEAPONS } from "./comp-analyzer-constants";
import type { CategorizationType } from "./comp-analyzer-types";

const CATEGORIZATION_TYPES = [
	"category",
	"sub",
	"special",
] as const satisfies readonly CategorizationType[];

export const compAnalyzerSearchParams = SearchParams.define({
	categorization: SP.param(v.picklist(CATEGORIZATION_TYPES), {
		default: "category",
		loader: false,
	}),
	weapons: SP.param(
		v.pipe(v.array(numericEnum(mainWeaponIds)), v.maxLength(MAX_WEAPONS)),
		{
			default: [],
			loader: false,
		},
	),
	singleCombos: SP.param(v.boolean(), { default: false, loader: false }),
	subDef: SP.param(
		v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_AP)),
		{
			default: 0,
			loader: false,
		},
	),
	res: SP.param(
		v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_AP)),
		{
			default: 0,
			loader: false,
		},
	),
});
