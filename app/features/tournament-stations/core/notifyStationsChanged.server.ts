import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentStationsChannel } from "../tournament-stations-utils";
import { clearTournamentStationsStateCache } from "./tournamentStationsState.server";

/**
 * Call after a LAN tournament's stations or the matches queued on them change: drops the cached stations state,
 * refreshes the stations board, match pages and bracket of everyone viewing them and the header status (which shows
 * the station and ETA) of the teams of `matchIds`.
 */
export function notifyStationsChanged({
	tournament,
	matchIds,
}: {
	tournament: Tournament;
	matchIds: number[];
}) {
	clearTournamentStationsStateCache(tournament.ctx.id);

	ChatSystemMessage.send({
		channel: tournamentStationsChannel(tournament.ctx.id),
	});
	ChatSystemMessage.notifyStatusChanged(memberUserIds(tournament, matchIds));
}

function memberUserIds(tournament: Tournament, matchIds: number[]) {
	const matchIdSet = new Set(matchIds);

	return tournament.brackets
		.filter((bracket) => !bracket.preview)
		.flatMap((bracket) => bracket.data.match)
		.filter((match) => matchIdSet.has(match.id))
		.flatMap((match) => [match.opponent1?.id, match.opponent2?.id])
		.flatMap((teamId) =>
			typeof teamId === "number"
				? (tournament.teamById(teamId)?.memberUserIds ?? [])
				: [],
		);
}
