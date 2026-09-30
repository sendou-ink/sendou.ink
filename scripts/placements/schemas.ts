import * as v from "valibot";

const placements = v.object({
	edges: v.array(
		v.object({
			node: v.object({
				id: v.string(),
				name: v.string(),
				rank: v.number(),
				rankDiff: v.union([v.string(), v.null()]),
				xPower: v.number(),
				weapon: v.object({
					name: v.string(),
					image: v.object({ url: v.string() }),
					id: v.string(),
					image3d: v.object({ url: v.string() }),
					image2d: v.object({ url: v.string() }),
					image3dThumbnail: v.object({ url: v.string() }),
					image2dThumbnail: v.object({ url: v.string() }),
					subWeapon: v.object({
						name: v.string(),
						image: v.object({ url: v.string() }),
						id: v.string(),
					}),
					specialWeapon: v.object({
						name: v.string(),
						image: v.object({ url: v.string() }),
						id: v.string(),
					}),
				}),
				weaponTop: v.boolean(),
				__isPlayer: v.string(),
				byname: v.string(),
				nameId: v.string(),
				nameplate: v.object({
					badges: v.array(
						v.union([
							v.object({
								image: v.object({ url: v.string() }),
								id: v.string(),
							}),
							v.null(),
						]),
					),
					background: v.object({
						textColor: v.object({
							a: v.number(),
							b: v.number(),
							g: v.number(),
							r: v.number(),
						}),
						image: v.object({ url: v.string() }),
						id: v.string(),
					}),
				}),
				__typename: v.string(),
			}),
			cursor: v.string(),
		}),
	),
	pageInfo: v.object({ endCursor: v.string(), hasNextPage: v.boolean() }),
});

// e.g. https://splatoon3.ink/data/xrank/xrank.detail.a-2.clamblitz.json
export const xRankSchema = v.object({
	data: v.object({
		node: v.object({
			__typename: v.string(),
			xRankingAr: v.optional(placements),
			xRankingCl: v.optional(placements),
			xRankingLf: v.optional(placements),
			xRankingGl: v.optional(placements),
			id: v.string(),
		}),
	}),
});
