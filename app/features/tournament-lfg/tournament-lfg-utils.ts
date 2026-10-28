import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";

/** Event bus channel that every user on the tournament's LFG page subscribes to. */
export const tournamentLFGChannel = (tournamentId: number) =>
	`${tournamentChannel(tournamentId)}__lfg`;

/** Event bus channel for revalidation messages targeted at a single LFG group (e.g. a received invitation). */
export const tournamentLFGGroupChannel = ({
	tournamentId,
	groupId,
}: {
	tournamentId: number;
	groupId: number;
}) => `${tournamentLFGChannel(tournamentId)}__group__${groupId}`;
