import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { addPendingPlusTiers } from "~/features/leaderboards/core/leaderboards.server";
import { userSPLeaderboard } from "~/features/leaderboards/queries/userSPLeaderboard.server";
import { currentSeason, previousSeason } from "~/features/mmr/season";
import { seasonToVotingRange } from "~/features/plus-voting/core/voting-time";
import invariant from "~/utils/invariant";
import { userIsBanned } from "../../ban/core/banned.server";

export async function plusTiersFromVotingAndLeaderboard() {
	const newMembersFromLeaderboard = fromLeaderboard();
	const newMembersFromVoting =
		await AdminRepository.allPlusTiersFromLatestVoting();

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

function fromLeaderboard() {
	const now = new Date();
	const lastCompletedSeason = previousSeason(now);
	invariant(lastCompletedSeason, "No previous season found");

	const currSeason = currentSeason(now);
	if (currSeason) {
		const range = seasonToVotingRange(currSeason);

		// we are in the period of a season where the season's voting
		// has ended but we don't yet have the latest leaderboard results
		// -> last season's results are no longer valid
		if (range.endDate < now) return [];
	}

	const leaderboard = addPendingPlusTiers(
		userSPLeaderboard(lastCompletedSeason.nth),
	);

	return leaderboard.flatMap((entry) => {
		if (!entry.pendingPlusTier) return [];

		return {
			userId: entry.id,
			tier: entry.pendingPlusTier,
		};
	});
}
