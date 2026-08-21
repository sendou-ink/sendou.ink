import * as v from "valibot";
import {
	ability,
	hexCodeWithoutAlpha,
	modeShort,
	specialWeaponId,
	stageId,
	subWeaponId,
	weaponSplId,
} from "~/utils/schema";
import { assertType } from "~/utils/types";

export const tierListItemTypeSchema = v.picklist([
	"main-weapon",
	"sub-weapon",
	"special-weapon",
	"stage",
	"mode",
	"stage-mode",
	"ability",
]);
assertType<
	v.InferOutput<typeof tierListItemTypeSchema>,
	TierListItem["type"]
>();

const tierListItemSchema = v.union([
	v.object({
		id: weaponSplId,
		nth: v.optional(v.number()),
		type: v.literal("main-weapon"),
	}),
	v.object({
		id: subWeaponId,
		nth: v.optional(v.number()),
		type: v.literal("sub-weapon"),
	}),
	v.object({
		id: specialWeaponId,
		nth: v.optional(v.number()),
		type: v.literal("special-weapon"),
	}),
	v.object({
		id: stageId,
		nth: v.optional(v.number()),
		type: v.literal("stage"),
	}),
	v.object({
		id: modeShort,
		nth: v.optional(v.number()),
		type: v.literal("mode"),
	}),
	v.object({
		id: v.string(),
		nth: v.optional(v.number()),
		type: v.literal("stage-mode"),
	}),
	v.object({
		id: ability,
		nth: v.optional(v.number()),
		type: v.literal("ability"),
	}),
]);

export type TierListItem = v.InferOutput<typeof tierListItemSchema>;

const tierSchema = v.object({
	id: v.string(),
	name: v.string(),
	color: hexCodeWithoutAlpha,
});

export type TierListMakerTier = v.InferOutput<typeof tierSchema>;

type TierListItemSchemaType = v.InferOutput<typeof tierListItemSchema>;

export const tierListStateSerializedSchema = v.object({
	tiers: v.array(tierSchema),
	tierItems: v.array(v.tuple([v.string(), v.array(tierListItemSchema)])),
});

export type TierListState = {
	tiers: Array<TierListMakerTier>;
	tierItems: Map<string, TierListItemSchemaType[]>;
};
