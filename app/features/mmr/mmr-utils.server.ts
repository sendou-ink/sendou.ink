import { rating } from "openskill";
import type { Tables } from "~/db/tables";
import invariant from "~/utils/invariant";
import { identifierToUserIds, type SkillTeamIdentifier } from "./mmr-utils";
import * as SkillRepository from "./SkillRepository.server";

type Rating = Pick<Tables["Skill"], "mu" | "sigma">;
type RatingWithMatchesCount = { rating: Rating; matchesCount: number };

/**
 * Loads the season's current ratings of the users and teams in two queries as synchronous lookups
 * so rating math stays pure. Missing skill rows resolve to the default rating; asking for anything
 * outside `userIds`/`identifiers` throws, as a silent default would pass for a real one.
 * `teamPlayerAverage` reads the members' ratings, so those users must be in `userIds`.
 */
export async function seasonRatings({
	season,
	userIds,
	identifiers,
}: {
	season: number;
	userIds: Array<number>;
	identifiers: Array<SkillTeamIdentifier>;
}) {
	const [userSkills, teamSkills] = await Promise.all([
		SkillRepository.findCurrentUserSkills({ season, userIds }),
		SkillRepository.findCurrentTeamSkills({ season, identifiers }),
	]);

	const loadedUserIds = new Set(userIds);
	const loadedIdentifiers = new Set(identifiers);

	const user = (userId: number): RatingWithMatchesCount => {
		invariant(
			loadedUserIds.has(userId),
			`Rating of user ${userId} was not loaded`,
		);

		const skill = userSkills.get(userId);
		if (!skill) return { rating: rating(), matchesCount: 0 };

		return { rating: rating(skill), matchesCount: skill.matchesCount };
	};

	const team = (identifier: SkillTeamIdentifier): RatingWithMatchesCount => {
		invariant(
			loadedIdentifiers.has(identifier),
			`Rating of team ${identifier} was not loaded`,
		);

		const skill = teamSkills.get(identifier);
		if (!skill) return { rating: rating(), matchesCount: 0 };

		return { rating: rating(skill), matchesCount: skill.matchesCount };
	};

	const teamPlayerAverage = (identifier: SkillTeamIdentifier): Rating => {
		const playerRatings = identifierToUserIds(identifier).map(
			(userId) => user(userId).rating,
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
	};

	return { user, team, teamPlayerAverage };
}

/** Loads the users' seeding ratings of one type in a single query as a synchronous lookup; users without one resolve to the default rating. */
export async function seedingRatings({
	type,
	userIds,
}: {
	type: Tables["SeedingSkill"]["type"];
	userIds: Array<number>;
}) {
	const skills = await SkillRepository.findSeedingSkills({ type, userIds });

	return (userId: number): Rating => skills.get(userId) ?? rating();
}
