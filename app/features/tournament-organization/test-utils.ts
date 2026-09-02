import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as TournamentTeamRepository from "../tournament/TournamentTeamRepository.server";

/**
 * Seeds a played tournament of `organizationId` starting at `startTime` (database timestamp,
 * seconds) with one team of `participantUserIds`, checked in by default. Its one match is played
 * out, because a participant of the organization's events is somebody in a game result.
 */
export async function seedOrgEventWithParticipants({
	organizationId,
	startTime,
	participantUserIds,
	checkIn = "in",
}: {
	organizationId: number;
	startTime: number;
	participantUserIds: number[];
	checkIn?: "in" | "out" | "none";
}) {
	const [ownerUserId] = participantUserIds;
	const asOwner = <T>(fn: () => T) => withUserId(ownerUserId, fn);

	const opponentUserIds = (
		await UserFactory.createMany(participantUserIds.length)
	).map((user) => user.id);

	const {
		id: tournamentId,
		teams: [team, opponent],
	} = await TournamentFactory.createPlayed(
		{
			authorId: ownerUserId,
			organizationId,
			startTimes: [startTime],
			minMembersPerTeam: participantUserIds.length,
		},
		{ teamRosters: [participantUserIds, opponentUserIds] },
	);

	// the opponent only gives the participants somebody to play, so it leaves no check in to be counted
	await asOwner(() =>
		TournamentTeamRepository.checkOut({
			tournamentTeamId: opponent.id,
			bracketIdx: null,
		}),
	);

	if (checkIn === "none") {
		await asOwner(() =>
			TournamentTeamRepository.checkOut({
				tournamentTeamId: team.id,
				bracketIdx: null,
			}),
		);
	}

	if (checkIn === "out") {
		// a check out only leaves a row of its own for one bracket, otherwise it undoes the check in
		await asOwner(async () => {
			await TournamentTeamRepository.checkOut({
				tournamentTeamId: team.id,
				bracketIdx: null,
			});
			await TournamentTeamRepository.checkIn(team.id, { bracketIdx: 0 });
			await TournamentTeamRepository.checkOut({
				tournamentTeamId: team.id,
				bracketIdx: 0,
			});
		});
	}

	return { tournamentId, teamId: team.id };
}
