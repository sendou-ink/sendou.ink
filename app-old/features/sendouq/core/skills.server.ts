import type { Rating } from "node_modules/openskill/dist/types";
import { ordinal } from "openskill";
import type {
	Group,
	GroupMatch,
	GroupSkillDifference,
	Skill,
	User,
	UserSkillDifference,
} from "~/db/types";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import {
	ordinalToSp,
	rate,
	userIdsToIdentifier,
} from "~/features/mmr/mmr-utils";
import {
	queryCurrentTeamRating,
	queryCurrentUserRating,
	queryTeamPlayerRatingAverage,
} from "~/features/mmr/mmr-utils.server";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";

export type MementoSkillDifferences = {
	users: Record<
		User["id"],
		{
			skillDifference?: UserSkillDifference;
		}
	>;
	groups: Record<
		Group["id"],
		{
			skillDifference?: GroupSkillDifference;
		}
	>;
};

export function calculateMatchSkills({
	groupMatchId,
	winner,
	loser,
	winnerGroupId,
	loserGroupId,
}: {
	groupMatchId: GroupMatch["id"];
	winner: User["id"][];
	loser: User["id"][];
	winnerGroupId: Group["id"];
	loserGroupId: Group["id"];
}) {
	const newSkills: Array<
		Pick<
			Skill,
			"groupMatchId" | "identifier" | "mu" | "season" | "sigma" | "userId"
		>
	> = [];
	const differences: MementoSkillDifferences = { users: {}, groups: {} };

	const season = currentOrPreviousSeason(new Date())?.nth;
	invariant(typeof season === "number", "No ranked season for skills");

	{
		const oldWinnerRatings = winner.map((userId) =>
			queryCurrentUserRating({ userId, season }),
		);
		const oldLoserRatings = loser.map((userId) =>
			queryCurrentUserRating({ userId, season }),
		);

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
		const winnerTeamIdentifier = userIdsToIdentifier(winner);
		const loserTeamIdentifier = userIdsToIdentifier(loser);

		const oldWinnerGroupRating = queryCurrentTeamRating({
			identifier: winnerTeamIdentifier,
			season,
		});
		const oldLoserGroupRating = queryCurrentTeamRating({
			identifier: loserTeamIdentifier,
			season,
		});
		const [[winnerGroupNew], [loserGroupNew]] = rate(
			[[oldWinnerGroupRating.rating], [oldLoserGroupRating.rating]],
			[
				[
					queryTeamPlayerRatingAverage({
						identifier: winnerTeamIdentifier,
						season,
					}),
				],
				[
					queryTeamPlayerRatingAverage({
						identifier: loserTeamIdentifier,
						season,
					}),
				],
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
		return {
			calculated,
			spDiff: roundToNDecimalPlaces(
				ordinalToSp(ordinal(newRating)) - ordinalToSp(ordinal(oldRating)),
			),
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
