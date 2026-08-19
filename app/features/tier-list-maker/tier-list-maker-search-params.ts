import * as v from "valibot";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort } from "~/utils/zod";
import { DEFAULT_TIERS } from "./tier-list-maker-constants";
import {
	type TierListState,
	tierListItemTypeSchema,
	tierListStateSerializedSchema,
} from "./tier-list-maker-schemas";

const EMPTY_TIER_LIST_STATE: TierListState = {
	tiers: DEFAULT_TIERS,
	tierItems: new Map(),
};

const tierListState = v.codec(v.string(), v.custom<TierListState>(() => true), {
	decode: (value, payload) => {
		const serialized = parseSerializedJson(value);
		if (!serialized) {
			payload.issues.push({
				code: "custom",
				message: "Invalid tier list state",
				input: value,
			});
			return v.NEVER;
		}
		return {
			tiers: serialized.tiers,
			tierItems: new Map(serialized.tierItems),
		};
	},
	encode: (state) =>
		JSON.stringify({
			tiers: state.tiers,
			tierItems: Array.from(state.tierItems.entries()),
		}),
});

export const tierListMakerSearchParams = SearchParams.define({
	state: SP.custom(tierListState, {
		default: EMPTY_TIER_LIST_STATE,
		loader: false,
		compress: true,
	}),
	type: SP.param(tierListItemTypeSchema, {
		default: "main-weapon",
		loader: false,
	}),
	title: SP.param(v.string(), { default: "", loader: false }),
	showTierHeaders: SP.param(v.boolean(), { default: true, loader: false }),
	hideAltKits: SP.param(v.boolean(), { default: false, loader: false }),
	hideAltSkins: SP.param(v.boolean(), { default: false, loader: false }),
	canAddDuplicates: SP.param(v.boolean(), { default: false, loader: false }),
	modes: SP.param(v.array(modeShort), {
		default: [...rankedModesShort],
		loader: false,
	}),
});

function parseSerializedJson(value: string) {
	let json: unknown;
	try {
		json = JSON.parse(value);
	} catch {
		return null;
	}

	const parsed = tierListStateSerializedSchema.safeParse(json);
	return parsed.success ? parsed.data : null;
}
