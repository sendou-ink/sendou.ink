import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { addPendingPlusTiers } from "~/features/leaderboards/core/leaderboards.server";
import { userSPLeaderboard } from "~/features/leaderboards/queries/userSPLeaderboard.server";
import { previousSeason } from "~/features/mmr/season";
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

	// there has been voting after this season ended, the results no longer apply
	if (now.getMonth() !== lastCompletedSeason.ends.getMonth()) return [];

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
