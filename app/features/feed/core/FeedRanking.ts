import {
	FEED_AUDIENCE_AFFINITY,
	FEED_ITEM_TYPES,
	FEED_MAX_AGE_HALF_LIVES,
	FEED_RELATION_AUDIENCE,
	FEED_SAME_ACTOR_PENALTY,
	FEED_SAME_CATEGORY_PENALTY,
	type FeedItemType,
	type FeedItemTypeDefinition,
	type FeedRelation,
} from "../feed-constants";

export interface RankableItem {
	type: FeedItemType;
	/** Database timestamp (seconds) of when the item happened */
	at: number;
	/** Who the item is about, used to stop one person taking over the feed */
	actorKey: string;
	/** How the viewer knows who the item is about, `null` when it isn't about someone they know */
	relation: FeedRelation | null;
}

export interface ScoreBreakdown {
	base: number;
	affinity: number;
	recency: number;
	ageHours: number;
	diversity: number;
	total: number;
}

/**
 * Score of an item before the diversity pass: base score of its type × affinity × exponential
 * recency decay by the type's half-life. Affinity is that of the item's relation, or without one
 * the closest audience of its type. Live items don't decay.
 */
export function score(
	item: Pick<RankableItem, "type" | "at" | "relation">,
	now: number,
): Omit<ScoreBreakdown, "diversity"> {
	const definition: FeedItemTypeDefinition = FEED_ITEM_TYPES[item.type];
	const affinity = item.relation
		? FEED_AUDIENCE_AFFINITY[FEED_RELATION_AUDIENCE[item.relation]]
		: Math.max(
				...definition.audience.map(
					(audience) => FEED_AUDIENCE_AFFINITY[audience],
				),
			);
	const ageHours = Math.max(0, (now - item.at) / 3600);
	const recency = definition.isLive
		? 1
		: 0.5 ** (ageHours / definition.halfLifeHours);

	return {
		base: definition.baseScore,
		affinity,
		recency,
		ageHours,
		total: definition.baseScore * affinity * recency,
	};
}

/** Whether the item is too old to show, `FEED_MAX_AGE_HALF_LIVES` half-lives of its type. Live and pinned items never are. */
export function isStale(item: Pick<RankableItem, "type" | "at">, now: number) {
	const definition: FeedItemTypeDefinition = FEED_ITEM_TYPES[item.type];
	if (definition.isLive || definition.isPinned) return false;

	return (
		(now - item.at) / 3600 > FEED_MAX_AGE_HALF_LIVES * definition.halfLifeHours
	);
}

/**
 * Orders items by score with a greedy diversity pass: each pick is penalized if its category
 * appeared in the previous two picks or its actor in the previous four.
 */
export function rank<T extends RankableItem>(
	items: T[],
	now: number,
): Array<T & { score: ScoreBreakdown }> {
	const pool = items.map((item) => ({ item, ...score(item, now) }));
	const result: Array<T & { score: ScoreBreakdown }> = [];

	while (pool.length > 0) {
		const recentCategories = result
			.slice(-2)
			.map((picked) => FEED_ITEM_TYPES[picked.type].category);
		const recentActors = result.slice(-4).map((picked) => picked.actorKey);

		let bestIndex = 0;
		let bestDiversity = 1;
		let bestFinal = -1;
		for (const [index, candidate] of pool.entries()) {
			const diversity =
				(recentCategories.includes(
					FEED_ITEM_TYPES[candidate.item.type].category,
				)
					? FEED_SAME_CATEGORY_PENALTY
					: 1) *
				(recentActors.includes(candidate.item.actorKey)
					? FEED_SAME_ACTOR_PENALTY
					: 1);
			const final = candidate.total * diversity;
			if (final > bestFinal) {
				bestIndex = index;
				bestDiversity = diversity;
				bestFinal = final;
			}
		}

		const [best] = pool.splice(bestIndex, 1);
		result.push({
			...best.item,
			score: {
				base: best.base,
				affinity: best.affinity,
				recency: best.recency,
				ageHours: best.ageHours,
				diversity: bestDiversity,
				total: bestFinal,
			},
		});
	}

	return result;
}
