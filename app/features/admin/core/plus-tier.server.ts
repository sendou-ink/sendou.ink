import { addPendingPlusTiers } from "~/features/leaderboards/core/leaderboards.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { seasonToVotingRange } from "~/features/plus-voting/core/voting-time";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import invariant from "~/utils/invariant";
import { userIsBanned } from "../../ban/core/banned.server";

export async function plusTiersFromVotingAndLeaderboard() {
	const newMembersFromVoting =
		await PlusVotingRepository.findAllPlusTiersFromLatestVoting();
	const newMembersFromLeaderboard = await fromLeaderboard(newMembersFromVoting);
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

async function fromLeaderboard(
	newMembersFromVoting: Array<{ userId: number; plusTier: number }>,
) {
	const now = new Date();
	const lastCompletedSeason = Seasons.previous();
	invariant(lastCompletedSeason, "No previous season found");

	const currSeason = Seasons.current();
	if (currSeason) {
		const range = seasonToVotingRange(currSeason);

		// voting has ended but the latest leaderboard isn't in yet, so last season's results are stale
		if (range.endDate < now) return [];
	}

	const leaderboard = addPendingPlusTiers(
		await LeaderboardRepository.findUserSPLeaderboard(lastCompletedSeason.nth),
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
