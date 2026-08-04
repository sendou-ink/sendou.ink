import { ordinal, type Rating } from "openskill";
import type { Tables } from "~/db/tables";
import type {
	GroupSkillDifference,
	UserSkillDifference,
} from "~/db/tables-json";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	ordinalToSp,
	rate,
	userIdsToIdentifier,
} from "~/features/mmr/mmr-utils";
import { seasonRatings } from "~/features/mmr/mmr-utils.server";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";

export type MementoSkillDifferences = {
	users: Record<
		Tables["User"]["id"],
		{
			skillDifference?: UserSkillDifference;
		}
	>;
	groups: Record<
		Tables["Group"]["id"],
		{
			skillDifference?: GroupSkillDifference;
		}
	>;
};

export async function calculateMatchSkills({
	groupMatchId,
	winner,
	loser,
	winnerGroupId,
	loserGroupId,
}: {
	groupMatchId: Tables["GroupMatch"]["id"];
	winner: Tables["User"]["id"][];
	loser: Tables["User"]["id"][];
	winnerGroupId: Tables["Group"]["id"];
	loserGroupId: Tables["Group"]["id"];
}) {
	const newSkills: Array<
		Pick<
			Tables["Skill"],
			"groupMatchId" | "identifier" | "mu" | "season" | "sigma" | "userId"
		>
	> = [];
	const differences: MementoSkillDifferences = { users: {}, groups: {} };

	const season = Seasons.currentOrPrevious()?.nth;
	invariant(typeof season === "number", "No ranked season for skills");

	const winnerTeamIdentifier = userIdsToIdentifier(winner);
	const loserTeamIdentifier = userIdsToIdentifier(loser);

	const ratings = await seasonRatings({
		season,
		userIds: [...winner, ...loser],
		identifiers: [winnerTeamIdentifier, loserTeamIdentifier],
	});

	{
		const oldWinnerRatings = winner.map((userId) => ratings.user(userId));
		const oldLoserRatings = loser.map((userId) => ratings.user(userId));

		// individual skills
		const [winnerTeamNew, loserTeamNew] = rate([
			oldWinnerRatings.map(({ rating }) => rating),
			oldLoserRatings.map(({ rating }) => rating),
		]);

		for (const [index, userId] of winner.entries()) {
			newSkills.push({
				groupMatchId: groupMatchId,
				identifier: null,
				mu: winnerTeamNew[index].mu,
				season,
				sigma: winnerTeamNew[index].sigma,
				userId,
			});

			differences.users[userId] = {
				skillDifference: userSkillDifference({
					oldRating: oldWinnerRatings[index].rating,
					newRating: winnerTeamNew[index],
					matchesCount: oldWinnerRatings[index].matchesCount,
				}),
			};
		}

		for (const [index, userId] of loser.entries()) {
			newSkills.push({
				groupMatchId: groupMatchId,
				identifier: null,
				mu: loserTeamNew[index].mu,
				season,
				sigma: loserTeamNew[index].sigma,
				userId,
			});

			differences.users[userId] = {
				skillDifference: userSkillDifference({
					oldRating: oldLoserRatings[index].rating,
					newRating: loserTeamNew[index],
					matchesCount: oldLoserRatings[index].matchesCount,
				}),
			};
		}
	}

	{
		// team skills
		const oldWinnerGroupRating = ratings.team(winnerTeamIdentifier);
		const oldLoserGroupRating = ratings.team(loserTeamIdentifier);

		const [[winnerGroupNew], [loserGroupNew]] = rate(
			[[oldWinnerGroupRating.rating], [oldLoserGroupRating.rating]],
			[
				[ratings.teamPlayerAverage(winnerTeamIdentifier)],
				[ratings.teamPlayerAverage(loserTeamIdentifier)],
			],
		);

		newSkills.push({
			groupMatchId: groupMatchId,
			identifier: winnerTeamIdentifier,
			mu: winnerGroupNew.mu,
			season,
			sigma: winnerGroupNew.sigma,
			userId: null,
		});
		newSkills.push({
			groupMatchId: groupMatchId,
			identifier: loserTeamIdentifier,
			mu: loserGroupNew.mu,
			season,
			sigma: loserGroupNew.sigma,
			userId: null,
		});

		differences.groups[winnerGroupId] = {
			skillDifference: groupSkillDifference({
				oldRating: oldWinnerGroupRating.rating,
				newRating: winnerGroupNew,
				matchesCount: oldWinnerGroupRating.matchesCount,
			}),
		};
		differences.groups[loserGroupId] = {
			skillDifference: groupSkillDifference({
				oldRating: oldLoserGroupRating.rating,
				newRating: loserGroupNew,
				matchesCount: oldLoserGroupRating.matchesCount,
			}),
		};
	}

	return { newSkills, differences };
}

function userSkillDifference({
	oldRating,
	newRating,
	matchesCount,
}: {
	oldRating: Rating;
	newRating: Rating;
	matchesCount: number;
}): UserSkillDifference {
	const calculated = matchesCount >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD;

	if (calculated) {
		const oldSp = ordinalToSp(ordinal(oldRating));
		const newSp = ordinalToSp(ordinal(newRating));
		return {
			calculated,
			spDiff: roundToNDecimalPlaces(newSp - oldSp),
			oldSp,
			newSp,
		};
	}

	return {
		calculated,
		matchesCount: matchesCount + 1,
		matchesCountNeeded: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
		newSp:
			matchesCount + 1 === MATCHES_COUNT_NEEDED_FOR_LEADERBOARD
				? ordinalToSp(ordinal(newRating))
				: undefined,
	};
}

function groupSkillDifference({
	oldRating,
	newRating,
	matchesCount,
}: {
	oldRating: Rating;
	newRating: Rating;
	matchesCount: number;
}): GroupSkillDifference {
	const calculated = matchesCount >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD;

	if (calculated) {
		return {
			calculated,
			newSp: ordinalToSp(ordinal(newRating)),
			oldSp: ordinalToSp(ordinal(oldRating)),
		};
	}

	return {
		calculated,
		matchesCount: matchesCount + 1,
		matchesCountNeeded: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
		newSp:
			matchesCount + 1 === MATCHES_COUNT_NEEDED_FOR_LEADERBOARD
				? ordinalToSp(ordinal(newRating))
				: undefined,
	};
}
