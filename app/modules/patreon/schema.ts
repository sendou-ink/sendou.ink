import { z } from "zod";
import {
	TIER_1_ID,
	TIER_2_ID,
	TIER_3_ID,
	TIER_4_ID,
	UNKNOWN_TIER_ID,
} from "./constants";

export const patronResponseSchema = z.object({
	data: z.array(
		z.object({
			attributes: z.object({}),
			id: z.string(),
			relationships: z.object({
				currently_entitled_tiers: z.object({
					data: z.array(
						z.object({
							id: z.enum([
								TIER_1_ID,
								TIER_2_ID,
								TIER_3_ID,
								TIER_4_ID,
								UNKNOWN_TIER_ID,
							]),
							type: z.string(),
							attributes: z
								.object({
									created_at: z.string(),
								})
								.nullish(),
						}),
					),
				}),
				user: z.object({
					data: z.object({ id: z.string(), type: z.string() }),
					links: z.object({ related: z.string() }),
				}),
			}),
			type: z.string(),
		}),
	),
	included: z
		.array(
			z.object({
				attributes: z.object({
					social_connections: z
						.object({
							discord: z
								.object({
									user_id: z.string(),
								})
								.nullish(),
						})
						.nullish(),
				}),
				id: z.string(),
				type: z.string(),
			}),
		)
		.nullish(),
	links: z.object({ next: z.string() }).nullish(),
	meta: z.object({
		pagination: z.object({
			cursors: z.object({ next: z.string().nullish() }),
			total: z.number(),
		}),
	}),
});
