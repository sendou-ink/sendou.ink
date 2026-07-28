import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as TournamentTeamRepository from "../tournament/TournamentTeamRepository.server";

/**
 * Seeds a played tournament hosted by `organizationId`, starting at `startTime`
 * (a database timestamp in seconds), with one team whose roster is
 * `participantUserIds`. The team is checked in by default.
 *
 * The bracket is started and its one match played out, because a participant of
 * the organization's events is somebody who appears in a game result.
 *
 * Only meant for use in tests.
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

	// the opponent exists only to give the participants somebody to play, so it
	// leaves no check in behind to be counted as one of the event's own teams
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
		// a check out leaves a row of its own only when it concerns one bracket,
		// otherwise checking out simply undoes the check in
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
