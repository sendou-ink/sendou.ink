import { z } from "zod/v4";
import { assertType } from "~/utils/types";
import {
	hexCode,
	modeShort,
	specialWeaponId,
	stageId,
	subWeaponId,
	weaponSplId,
} from "~/utils/zod";

export const tierListItemTypeSchema = z.enum([
	"main-weapon",
	"sub-weapon",
	"special-weapon",
	"stage",
	"mode",
	"stage-mode",
]);
assertType<z.infer<typeof tierListItemTypeSchema>, TierListItem["type"]>();

const tierListItemSchema = z.union([
	z.object({
		id: weaponSplId,
		type: z.literal("main-weapon"),
	}),
	z.object({
		id: subWeaponId,
		type: z.literal("sub-weapon"),
	}),
	z.object({
		id: specialWeaponId,
		type: z.literal("special-weapon"),
	}),
	z.object({
		id: stageId,
		type: z.literal("stage"),
	}),
	z.object({
		id: modeShort,
		type: z.literal("mode"),
	}),
	z.object({
		id: z.string(),
		type: z.literal("stage-mode"),
	}),
]);

export type TierListItem = z.infer<typeof tierListItemSchema>;

const tierSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: hexCode,
});

export type TierListMakerTier = z.infer<typeof tierSchema>;

type TierListItemSchemaType = z.infer<typeof tierListItemSchema>;

export const tierListStateSerializedSchema = z.object({
	tiers: z.array(tierSchema),
	tierItems: z.array(z.tuple([z.string(), z.array(tierListItemSchema)])),
});

export type TierListState = {
	tiers: Array<TierListMakerTier>;
	tierItems: Map<string, TierListItemSchemaType[]>;
};
