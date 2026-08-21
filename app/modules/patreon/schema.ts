import * as v from "valibot";
import {
	TIER_1_ID,
	TIER_2_ID,
	TIER_3_ID,
	TIER_4_ID,
	UNKNOWN_TIER_ID,
} from "./constants";

export const patreonRateLimitSchema = v.object({
	errors: v.array(
		v.object({
			retry_after_seconds: v.optional(v.number()),
		}),
	),
});

export const patronResponseSchema = v.object({
	data: v.array(
		v.object({
			attributes: v.object({
				pledge_relationship_start: v.nullish(v.string()),
			}),
			id: v.string(),
			relationships: v.object({
				currently_entitled_tiers: v.object({
					data: v.array(
						v.object({
							id: v.picklist([
								TIER_1_ID,
								TIER_2_ID,
								TIER_3_ID,
								TIER_4_ID,
								UNKNOWN_TIER_ID,
							]),
							type: v.string(),
						}),
					),
				}),
				user: v.object({
					data: v.object({ id: v.string(), type: v.string() }),
					links: v.object({ related: v.string() }),
				}),
			}),
			type: v.string(),
		}),
	),
	included: v.optional(
		v.nullable(
			v.array(
				v.object({
					attributes: v.object({
						social_connections: v.optional(
							v.nullable(
								v.object({
									discord: v.optional(
										v.nullable(
											v.object({
												user_id: v.string(),
											}),
										),
									),
								}),
							),
						),
					}),
					id: v.string(),
					type: v.string(),
				}),
			),
		),
	),
	links: v.nullish(v.object({ next: v.string() })),
	meta: v.object({
		pagination: v.object({
			cursors: v.object({ next: v.nullish(v.string()) }),
			total: v.number(),
		}),
	}),
});
