import { TIERS } from "~/features/mmr/mmr-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import { invariant } from "~/utils/invariant";
import type { TierDifference } from "../q-types";

const ALL_TIERS_ORDERED = TIERS.flatMap((tier) => [
	{ name: tier.name, isPlus: true },
	{ name: tier.name, isPlus: false },
]).reverse();
const TIERS_ORDERED_WITHOUT_LEVIATHAN = ALL_TIERS_ORDERED.filter(
	(tier) => tier.name !== "LEVIATHAN",
);

export function tierDifferenceToRangeOrExact({
	ourTier,
	theirTier,
	isAccurateTiers,
}: {
	ourTier: TieredSkill["tier"];
	theirTier: TieredSkill["tier"];
	isAccurateTiers: boolean;
}): TierDifference {
	if (ourTier.name === theirTier.name && ourTier.isPlus === theirTier.isPlus) {
		return { type: "exact", diff: 0, tier: structuredClone(ourTier) };
	}

	const tiers = orderedTiers(isAccurateTiers);

	const tier1Idx = getTierIndex(ourTier, isAccurateTiers);
	const tier2Idx = getTierIndex(theirTier, isAccurateTiers);
	invariant(tier1Idx !== null, "tier1 not found");
	invariant(tier2Idx !== null, "tier2 not found");

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

/** Position of the tier in the best-first tier list (Leviathan left out unless tiers are accurate), null if not found. */
export function getTierIndex(
	tier: TieredSkill["tier"] | null | undefined,
	isAccurateTiers: boolean,
) {
	if (!tier) return null;

	const index = orderedTiers(isAccurateTiers).findIndex(
		(t) => t.name === tier.name && t.isPlus === tier.isPlus,
	);

	return index === -1 ? null : index;
}

function orderedTiers(isAccurateTiers: boolean) {
	return isAccurateTiers ? ALL_TIERS_ORDERED : TIERS_ORDERED_WITHOUT_LEVIATHAN;
}
