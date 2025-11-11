import { z } from "zod/v4";

export const tierListItemTypeSchema = z.enum([
	"main-weapon",
	"sub-weapon",
	"special-weapon",
	"stage",
]);

// xxx: proper id schemas here
const tierListItemSchema = z.union([
	z.object({
		id: z.number(),
		type: z.literal("main-weapon"),
	}),
	z.object({
		id: z.number(),
		type: z.literal("sub-weapon"),
	}),
	z.object({
		id: z.number(),
		type: z.literal("special-weapon"),
	}),
	z.object({
		id: z.number(),
		type: z.literal("stage"),
	}),
]);

// xxx: can we get more specific?
const tierSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
});

type TierListItemSchemaType = z.infer<typeof tierListItemSchema>;

const tierListStateSerializedSchema = z.object({
	tiers: z.array(tierSchema),
	tierItems: z.array(z.tuple([z.string(), z.array(tierListItemSchema)])),
});

type TierListStateDecoded = {
	tiers: Array<z.infer<typeof tierSchema>>;
	tierItems: Map<string, TierListItemSchemaType[]>;
};

export const tierListStateSchema = z.codec(
	tierListStateSerializedSchema,
	z.custom<TierListStateDecoded>(),
	{
		decode: (data): TierListStateDecoded => ({
			tiers: data.tiers,
			tierItems: new Map(data.tierItems),
		}),
		encode: (data: TierListStateDecoded) => ({
			tiers: data.tiers,
			tierItems: Array.from(data.tierItems.entries()),
		}),
	},
);
