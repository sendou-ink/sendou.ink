import type { Tables } from "~/db/tables";
import { rate, userIdsToIdentifier } from "~/features/mmr/mmr-utils";
import { seasonRatings } from "~/features/mmr/mmr-utils.server";

/** New ratings for both a match's players and the two rosters they played it as. */
export async function calculateMatchSkills({
	groupMatchId,
	season,
	winner,
	loser,
}: {
	groupMatchId: Tables["GroupMatch"]["id"];
	season: number;
	winner: Tables["User"]["id"][];
	loser: Tables["User"]["id"][];
}) {
	const newSkills: Array<
		Pick<
			Tables["Skill"],
			"groupMatchId" | "identifier" | "mu" | "season" | "sigma" | "userId"
		>
	> = [];

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
		}
	}

	{
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
	}

	return newSkills;
}
