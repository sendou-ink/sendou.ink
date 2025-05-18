import { rating } from "openskill";
import type { Tables } from "../../db/tables";
import { identifierToUserIds } from "./mmr-utils";
import { findCurrentSkillByUserId } from "./queries/findCurrentSkillByUserId.server";
import { findCurrentTeamSkillByIdentifier } from "./queries/findCurrentTeamSkillByIdentifier.server";
import { findSeedingSkill } from "./queries/findSeedingSkill.server";

export function queryCurrentUserRating({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const skill = findCurrentSkillByUserId({ userId, season: season ?? null });

	if (!skill) {
		return { rating: rating(), matchesCount: 0 };
	}

	return { rating: rating(skill), matchesCount: skill.matchesCount };
}

export function queryCurrentUserSeedingRating(args: {
	userId: number;
	type: Tables["SeedingSkill"]["type"];
}) {
	const skill = findSeedingSkill(args);

	if (!skill) return rating();

	return skill;
}

export function queryCurrentTeamRating({
	identifier,
	season,
}: {
	identifier: string;
	season: number;
}) {
	const skill = findCurrentTeamSkillByIdentifier({
		identifier,
		season,
	});

	if (!skill) return { rating: rating(), matchesCount: 0 };

	return { rating: rating(skill), matchesCount: skill.matchesCount };
}

export function queryTeamPlayerRatingAverage({
	identifier,
	season,
}: {
	identifier: string;
	season: number;
}) {
	const playerRatings = identifierToUserIds(identifier).map(
		(userId) => queryCurrentUserRating({ userId, season }).rating,
	);

	if (playerRatings.length === 0) return rating();

	return {
		mu:
			playerRatings.reduce((acc, cur) => acc + cur.mu, 0) /
			playerRatings.length,
		sigma:
			playerRatings.reduce((acc, cur) => acc + cur.sigma, 0) /
			playerRatings.length,
	};
}
