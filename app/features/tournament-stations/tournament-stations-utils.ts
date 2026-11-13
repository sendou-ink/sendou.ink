import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";

/** Channel of the tournament's stations board: queue changes go here so other viewers of the tournament don't refetch. */
export const tournamentStationsChannel = (tournamentId: number) =>
	`${tournamentChannel(tournamentId)}__stations`;
