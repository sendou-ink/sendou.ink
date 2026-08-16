import invariant from "@sendou/utils/invariant";
import { TIERS, type TierName } from "./mmr-constants.ts";

/** Converts an openskill ordinal to the user-facing SP value (two decimals). */
export function ordinalToSp(ordinal: number) {
	return toTwoDecimals(ordinal * 15 + 1000);
}

/** Converts an openskill ordinal to the user-facing SP value rounded to an integer. */
export function ordinalToRoundedSp(ordinal: number) {
	return Math.round(ordinalToSp(ordinal));
}

function toTwoDecimals(value: number) {
	return Number(value.toFixed(2));
}

/** The four user ids of a full team, ascending and joined by `-`. Identifies a team across matches. */
export type SkillTeamIdentifier = `${number}-${number}-${number}-${number}`;

/** Builds the {@link SkillTeamIdentifier} of the given four user ids. */
export function userIdsToIdentifier(userIds: number[]): SkillTeamIdentifier {
	invariant(userIds.length === 4, "userIds for identifier must be length 4");
	return [...userIds].sort((a, b) => a - b).join("-") as SkillTeamIdentifier;
}

/** Splits a {@link SkillTeamIdentifier} back into its user ids. */
export function identifierToUserIds(identifier: SkillTeamIdentifier) {
	return identifier.split("-").map(Number);
}

/** Compares two tiers by rank; negative when `tier1` is higher. */
export function compareTwoTiers(tier1: TierName, tier2: TierName) {
	return (
		TIERS.findIndex(({ name }) => name === tier1) -
		TIERS.findIndex(({ name }) => name === tier2)
	);
}
