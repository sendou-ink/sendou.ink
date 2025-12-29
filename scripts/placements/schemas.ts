import { z } from "zod";

const placements = z.object({
	edges: z.array(
		z.object({
			node: z.object({
				id: z.string(),
				name: z.string(),
				rank: z.number(),
				rankDiff: z.union([z.string(), z.null()]),
				xPower: z.number(),
				weapon: z.object({
					name: z.string(),
					image: z.object({ url: z.string() }),
					id: z.string(),
					image3d: z.object({ url: z.string() }),
					image2d: z.object({ url: z.string() }),
					image3dThumbnail: z.object({ url: z.string() }),
					image2dThumbnail: z.object({ url: z.string() }),
					subWeapon: z.object({
						name: z.string(),
						image: z.object({ url: z.string() }),
						id: z.string(),
					}),
					specialWeapon: z.object({
						name: z.string(),
						image: z.object({ url: z.string() }),
						id: z.string(),
					}),
				}),
				weaponTop: z.boolean(),
				__isPlayer: z.string(),
				byname: z.string(),
				nameId: z.string(),
				nameplate: z.object({
					badges: z.array(
						z.union([
							z.object({
								image: z.object({ url: z.string() }),
								id: z.string(),
							}),
							z.null(),
						]),
					),
					background: z.object({
						textColor: z.object({
							a: z.number(),
							b: z.number(),
							g: z.number(),
							r: z.number(),
						}),
						image: z.object({ url: z.string() }),
						id: z.string(),
					}),
				}),
				__typename: z.string(),
			}),
			cursor: z.string(),
		}),
	),
	pageInfo: z.object({ endCursor: z.string(), hasNextPage: z.boolean() }),
});

// e.g. https://splatoon3.ink/data/xrank/xrank.detail.a-2.clamblitz.json
export const xRankSchema = z.object({
	data: z.object({
		node: z.object({
			__typename: z.string(),
			xRankingAr: placements.optional(),
			xRankingCl: placements.optional(),
			xRankingLf: placements.optional(),
			xRankingGl: placements.optional(),
			id: z.string(),
		}),
	}),
});
