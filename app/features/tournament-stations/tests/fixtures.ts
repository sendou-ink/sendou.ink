import * as CalendarEventVenueFactory from "~/db/seed/factories/CalendarEventVenueFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentStationFactory from "~/db/seed/factories/TournamentStationFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";

/**
 * A LAN tournament of the four teams of `teamRosters` (seed order) in a started single elimination
 * bracket: the two semifinals playable, the final not. Has the stations named in `stationNames`.
 */
export async function createStartedLanTournament({
	authorId,
	teamRosters,
	stationNames = ["Station 1", "Station 2"],
}: {
	authorId: number;
	teamRosters: number[][];
	stationNames?: string[];
}) {
	const tournament = await TournamentFactory.create({ authorId });
	await CalendarEventVenueFactory.create({ eventId: tournament.eventId });

	for (const memberUserIds of teamRosters) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds },
			{ isCheckedIn: true },
		);
	}

	const stationIds: number[] = [];
	for (const name of stationNames) {
		stationIds.push(
			(
				await TournamentStationFactory.create({
					tournamentId: tournament.id,
					name,
				})
			).id,
		);
	}

	await TournamentFactory.startBracket(tournament.id);

	const started = await tournamentFromDB(tournament.id);
	const matches = started.brackets[0].data.match.toSorted(
		(a, b) => a.roundId - b.roundId || a.number - b.number,
	);

	return {
		tournamentId: tournament.id,
		stationIds,
		semifinalIds: [matches[0].id, matches[1].id] as const,
		finalId: matches[2].id,
	};
}
