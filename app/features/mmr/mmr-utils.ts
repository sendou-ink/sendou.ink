import {
	rate as openskillRate,
	ordinal,
	type Rating,
	rating,
	type Team,
} from "openskill";
import { invariant } from "~/utils/invariant";
import type { TierName } from "./mmr-constants";
import { LOWEST_TIER, SP_BASE, SP_PER_ORDINAL, TIERS } from "./mmr-constants";
import type { SkillTierInterval, TieredSkill } from "./tiered.server";

const TAU = 0.3;

export function ordinalToSp(ordinalValue: number) {
	return toTwoDecimals(ordinalValue * SP_PER_ORDINAL + SP_BASE);
}

export function ordinalToRoundedSp(ordinalValue: number) {
	return Math.round(ordinalToSp(ordinalValue));
}

function toTwoDecimals(value: number) {
	return Number(value.toFixed(2));
}

export function rate(teams: Team[], secondaryTeams?: [[Rating], [Rating]]) {
	if (secondaryTeams) return rateConservative(teams, secondaryTeams);

	return openskillRate(teams, { tau: TAU, limitSigma: true });
}

// a team is rated against both the opposing team's rating and its players' average rating,
// taking the bigger boost (won) or smaller penalty (lost), so an inaccurate team rating
// (too few games) can't cost a huge amount of points
function rateConservative(
	teams: Team[],
	secondaryTeams: [[Rating], [Rating]],
): [[Rating], [Rating]] {
	const [[ordinaryRatingForWinner], [ordinaryRatingForLoser]] = openskillRate(
		teams,
		{
			tau: TAU,
			limitSigma: true,
		},
	);

	const [, [conservativeRatingForLoser]] = openskillRate(
		[secondaryTeams[0], teams[1]],
		{
			tau: TAU,
			limitSigma: true,
		},
	);

	const [[conservativeRatingForWinner]] = openskillRate(
		[teams[0], secondaryTeams[1]],
		{
			tau: TAU,
			limitSigma: true,
		},
	);

	const winnerRating =
		ordinal(ordinaryRatingForWinner) > ordinal(conservativeRatingForWinner)
			? ordinaryRatingForWinner
			: conservativeRatingForWinner;

	const loserRating =
		ordinal(ordinaryRatingForLoser) > ordinal(conservativeRatingForLoser)
			? ordinaryRatingForLoser
			: conservativeRatingForLoser;

	return [[winnerRating], [loserRating]];
}

/** The four user ids of a full team, ascending and joined by `-`. Identifies a team across matches. */
export type SkillTeamIdentifier = `${number}-${number}-${number}-${number}`;

export function userIdsToIdentifier(userIds: number[]): SkillTeamIdentifier {
	invariant(userIds.length === 4, "userIds for identifier must be length 4");
	return [...userIds].sort((a, b) => a - b).join("-") as SkillTeamIdentifier;
}

export function identifierToUserIds(identifier: SkillTeamIdentifier) {
	return identifier.split("-").map(Number);
}

export function defaultOrdinal() {
	return ordinal(rating());
}

export function compareTwoTiers(tier1: TierName, tier2: TierName) {
	return (
		TIERS.findIndex(({ name }) => name === tier1) -
		TIERS.findIndex(({ name }) => name === tier2)
	);
}

/** Tier the ordinal falls in, {@link LOWEST_TIER} when it is under every threshold (the lowest interval has none). */
export function tierOfOrdinal(
	intervals: SkillTierInterval[],
	ordinalValue: number,
): TieredSkill["tier"] {
	const interval = intervals.find(
		(i) =>
			typeof i.neededOrdinal === "number" && ordinalValue >= i.neededOrdinal,
	);

	return interval
		? { name: interval.name, isPlus: interval.isPlus }
		: LOWEST_TIER;
}
