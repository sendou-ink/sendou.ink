import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { backdate } from "../core/backdate";

/** Puts a team's candidate times on a league set's board, as its member does on the match page. */
export async function propose({
	matchId,
	tournamentTeamId,
	authorId,
	proposedAts,
	createdAt,
}: {
	matchId: number;
	tournamentTeamId: number;
	authorId: number;
	proposedAts: Array<number>;
	/** When the candidates were put up, for a board that should look older than now. */
	createdAt?: Date;
}) {
	const rows = await TournamentMatchRepository.insertScheduleProposals({
		matchId,
		tournamentTeamId,
		authorId,
		proposedAts,
	});

	for (const row of rows) {
		await backdate("TournamentMatchScheduleProposal", row.id, { createdAt });
	}

	return rows;
}

/** Agrees the league set's time, as a team's pick or the organizer's decision does. */
export function schedule({
	matchId,
	scheduledAt,
	byOrganizer = false,
}: {
	matchId: number;
	scheduledAt: number;
	byOrganizer?: boolean;
}) {
	return TournamentMatchRepository.scheduleMatch({
		matchId,
		scheduledAt,
		setByOrganizer: byOrganizer,
	});
}
