import { z } from "zod";
import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";
import { MAX_WEAPONS } from "./comp-analyzer-constants";
import type { CategorizationType } from "./comp-analyzer-types";

const CATEGORIZATION_TYPES = [
	"category",
	"sub",
	"special",
] as const satisfies readonly CategorizationType[];

export const compAnalyzerSearchParams = SearchParams.define({
	categorization: SP.param(z.enum(CATEGORIZATION_TYPES), {
		default: "category",
		loader: false,
	}),
	weapons: SP.param(z.array(numericEnum(mainWeaponIds)).max(MAX_WEAPONS), {
		default: [],
		loader: false,
	}),
	singleCombos: SP.param(z.boolean(), { default: false, loader: false }),
	subDef: SP.param(z.number().int().min(0).max(MAX_AP), {
		default: 0,
		loader: false,
	}),
	res: SP.param(z.number().int().min(0).max(MAX_AP), {
		default: 0,
		loader: false,
	}),
});
