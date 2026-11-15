import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	showsOneGroupAtATime,
	tournamentBracketChannel,
	tournamentChannel,
} from "~/features/tournament-bracket/tournament-bracket-utils";

/** Channel of the tournament's stations board: queue changes go here so other viewers of the tournament don't refetch. */
export const tournamentStationsChannel = (tournamentId: number) =>
	`${tournamentChannel(tournamentId)}__stations`;

/** Event channels whose events change the tournament's stations board: its queues, the tournament and the started brackets' matches. */
export function stationsBoardTopics(tournament: Tournament) {
	const tournamentId = tournament.ctx.id;

	return [
		tournamentChannel(tournamentId),
		tournamentStationsChannel(tournamentId),
		...tournament.brackets
			.filter((bracket) => !bracket.preview)
			.flatMap((bracket) => {
				const progression =
					tournament.ctx.settings.bracketProgression[bracket.idx];

				const groupIds = showsOneGroupAtATime(progression)
					? bracket.data.group.map((group) => group.id)
					: [null];

				return groupIds.map((groupId) =>
					tournamentBracketChannel({
						tournamentId,
						bracketIdx: bracket.idx,
						groupId,
					}),
				);
			}),
	];
}
