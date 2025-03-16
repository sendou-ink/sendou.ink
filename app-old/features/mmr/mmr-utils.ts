import type { Rating, Team } from "node_modules/openskill/dist/types";
import { rate as openskillRate, ordinal, rating } from "openskill";
import invariant from "~/utils/invariant";
import type { TierName } from "./mmr-constants";
import { TIERS } from "./mmr-constants";

const TAU = 0.3;

export function ordinalToSp(ordinal: number) {
	return toTwoDecimals(ordinal * 15 + 1000);
}

export function spToOrdinal(sp: number) {
	return (sp - 1000) / 15;
}

export function ordinalToRoundedSp(ordinal: number) {
	return Math.round(ordinalToSp(ordinal));
}

function toTwoDecimals(value: number) {
	return Number(value.toFixed(2));
}

export function rate(teams: Team[], secondaryTeams?: [[Rating], [Rating]]) {
	if (secondaryTeams) return rateConservative(teams, secondaryTeams);

	return openskillRate(teams, { tau: TAU, preventSigmaIncrease: true });
}

// when ranking teams we rate the team against the actual team rating that it played against
// as well as against the average ratings of the players on the team
// then they get the bigger boost of the two (if won) or the smaller penalty of the two (if lost)
// this is to avoid situations where teams might unexpectedly lose a huge amount of points
// due to other team score not being accurate (not enough games played) to their perceived skill level
function rateConservative(
	teams: Team[],
	secondaryTeams: [[Rating], [Rating]],
): [[Rating], [Rating]] {
	const [[ordinaryRatingForWinner], [ordinaryRatingForLoser]] = openskillRate(
		teams,
		{
			tau: TAU,
			preventSigmaIncrease: true,
		},
	);

	const [, [conservativeRatingForLoser]] = openskillRate(
		[secondaryTeams[0], teams[1]],
		{
			tau: TAU,
			preventSigmaIncrease: true,
		},
	);

	const [[conservativeRatingForWinner]] = openskillRate(
		[teams[0], secondaryTeams[1]],
		{
			tau: TAU,
			preventSigmaIncrease: true,
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

export function userIdsToIdentifier(userIds: number[]) {
	invariant(userIds.length === 4, "userIds for identifier must be length 4");
	return [...userIds].sort((a, b) => a - b).join("-");
}

export function identifierToUserIds(identifier: string) {
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
