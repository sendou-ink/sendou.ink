import { TIERS } from "~/features/mmr/mmr-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import invariant from "~/utils/invariant";
import type { TierDifference } from "../q-types";

const allTiersOrdered = TIERS.flatMap((tier) => [
	{ name: tier.name, isPlus: true },
	{ name: tier.name, isPlus: false },
]).reverse();
export function tierDifferenceToRangeOrExact({
	ourTier,
	theirTier,
	hasLeviathan,
}: {
	ourTier: TieredSkill["tier"];
	theirTier: TieredSkill["tier"];
	hasLeviathan: boolean;
}): TierDifference {
	if (ourTier.name === theirTier.name && ourTier.isPlus === theirTier.isPlus) {
		return { type: "exact", diff: 0, tier: structuredClone(ourTier) };
	}

	const tiers = hasLeviathan
		? allTiersOrdered
		: allTiersOrdered.filter((tier) => tier.name !== "LEVIATHAN");

	const tier1Idx = tiers.findIndex(
		(t) => t.name === ourTier.name && t.isPlus === ourTier.isPlus,
	);
	const tier2Idx = tiers.findIndex(
		(t) => t.name === theirTier.name && t.isPlus === theirTier.isPlus,
	);
	invariant(tier1Idx !== -1, "tier1 not found");
	invariant(tier2Idx !== -1, "tier2 not found");

	const idxDiff = Math.abs(tier1Idx - tier2Idx);

	const lowerBound = tier1Idx - idxDiff;
	const upperBound = tier1Idx + idxDiff;

	if (lowerBound < 0 || upperBound >= tiers.length) {
		return { type: "exact", diff: idxDiff, tier: structuredClone(theirTier) };
	}

	const lowerTier = tiers[lowerBound];
	const upperTier = tiers[upperBound];

	return {
		type: "range",
		diff: [-idxDiff, idxDiff],
		range: [structuredClone(lowerTier), structuredClone(upperTier)],
	};
}
