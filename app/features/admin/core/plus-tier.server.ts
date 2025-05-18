import { addPendingPlusTiers } from "~/features/leaderboards/core/leaderboards.server";
import { userSPLeaderboard } from "~/features/leaderboards/queries/userSPLeaderboard.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { seasonToVotingRange } from "~/features/plus-voting/core/voting-time";
import invariant from "~/utils/invariant";
import { userIsBanned } from "../../ban/core/banned.server";

export async function plusTiersFromVotingAndLeaderboard() {
	const newMembersFromVoting =
		await PlusVotingRepository.allPlusTiersFromLatestVoting();
	const newMembersFromLeaderboard = fromLeaderboard(newMembersFromVoting);
	return [
		...newMembersFromLeaderboard,
		// filter to ensure that user gets their highest tier
		...newMembersFromVoting.filter(
			(member) =>
				!newMembersFromLeaderboard.some(
					(leaderboardMember) => leaderboardMember.userId === member.userId,
				),
		),
	].filter(({ userId }) => !userIsBanned(userId));
}

function fromLeaderboard(
	newMembersFromVoting: Array<{ userId: number; plusTier: number }>,
) {
	const now = new Date();
	const lastCompletedSeason = Seasons.previous();
	invariant(lastCompletedSeason, "No previous season found");

	const currSeason = Seasons.current();
	if (currSeason) {
		const range = seasonToVotingRange(currSeason);

		// we are in the period of a season where the season's voting
		// has ended but we don't yet have the latest leaderboard results
		// -> last season's results are no longer valid
		if (range.endDate < now) return [];
	}

	const leaderboard = addPendingPlusTiers(
		userSPLeaderboard(lastCompletedSeason.nth),
		newMembersFromVoting,
		lastCompletedSeason.nth,
	);

	return leaderboard.flatMap((entry) => {
		if (!entry.pendingPlusTier) return [];

		return {
			userId: entry.id,
			plusTier: entry.pendingPlusTier,
		};
	});
}
