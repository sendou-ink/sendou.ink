/**
 * Notifications telling the teams of a LAN tournament's match which station to play it on. A match's teams are
 * told once it's the station's Now match, the first playable one of its queue (the one the board shows as Now, so
 * a match queued behind others waits its turn), and again ("Moved to Station 5") when it's Now on another station
 * than the one they were told. A notice is only sent after the match has stayed put for a while, so a
 * station picked by mistake and changed right after, or a match taken back to Waiting, never reaches the players.
 */
import type { Tables } from "~/db/tables";
import type { Notification } from "~/features/notifications/notifications-types";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as StationsBoard from "./StationsBoard";

/** The teams of a match should hear of its station. */
export interface StationNotice {
	matchId: number;
	stationId: number;
	/** The station they were told before, `null` if none. */
	previousStationId: number | null;
}

/** A notice waiting to be sent. */
export interface ScheduledNotice extends StationNotice {
	/** Timestamp it's sent at if the match stays on the station until then. */
	dueAt: number;
}

type StationNoticeTournament = Pick<
	Tournament,
	"matchIdToBracketIdx" | "matchStatusById"
>;

/** Each station's Now match, the first playable one of its queue, when the station isn't the one its teams were last told (if any). */
export function notices({
	tournament,
	placements,
	notifiedStations,
}: {
	tournament: StationNoticeTournament;
	/** Each station's queue in order. */
	placements: Array<
		Pick<Tables["TournamentMatchStation"], "matchId" | "stationId">
	>;
	/** The station each match's teams were last told. */
	notifiedStations: Array<Tables["TournamentMatchStationNotification"]>;
}): StationNotice[] {
	const notifiedStationIdByMatchId = new Map(
		notifiedStations.map((row) => [row.matchId, row.stationId]),
	);

	const stationIdsWithNow = new Set<number>();

	return placements.flatMap(({ matchId, stationId }) => {
		if (
			stationId === null ||
			stationIdsWithNow.has(stationId) ||
			!isPlayable(tournament, matchId)
		) {
			return [];
		}
		stationIdsWithNow.add(stationId);

		const previousStationId = notifiedStationIdByMatchId.get(matchId) ?? null;
		if (previousStationId === stationId) return [];

		return [{ matchId, stationId, previousStationId }];
	});
}

/**
 * Brings the scheduled notices up to date with the `current` ones ({@link notices}): a notice for a match newly
 * on its station is due `delayMs` from `now`, one already scheduled for the same station keeps its time, and
 * scheduled ones no longer current (the match moved, was taken off its station or finished) are dropped.
 * Returns the notices to send now and the ones still waiting.
 */
export function schedule({
	current,
	scheduled,
	now,
	delayMs,
}: {
	current: StationNotice[];
	scheduled: ScheduledNotice[];
	now: number;
	delayMs: number;
}): { due: StationNotice[]; scheduled: ScheduledNotice[] } {
	const scheduledByMatchId = new Map(
		scheduled.map((notice) => [notice.matchId, notice]),
	);

	const updated = current.map((notice) => {
		const existing = scheduledByMatchId.get(notice.matchId);

		return {
			...notice,
			dueAt:
				existing?.stationId === notice.stationId
					? existing.dueAt
					: now + delayMs,
		};
	});

	return {
		due: updated
			.filter((notice) => notice.dueAt <= now)
			.map(({ dueAt: _dueAt, ...notice }) => notice),
		scheduled: updated.filter((notice) => notice.dueAt > now),
	};
}

/** The notifications to send for the notice, one per team of the match as each is told who they play against. */
export function notifications({
	tournament,
	notice,
	station,
}: {
	tournament: Tournament;
	notice: StationNotice;
	station: Pick<Tables["TournamentStation"], "name" | "locationNote">;
}): Array<{ userIds: number[]; notification: Notification }> {
	const match = tournament.brackets
		.filter((bracket) => !bracket.preview)
		.flatMap((bracket) => bracket.data.match)
		.find((candidate) => candidate.id === notice.matchId);
	const teams = [match?.opponent1?.id, match?.opponent2?.id].map((teamId) =>
		typeof teamId === "number" ? tournament.teamById(teamId) : undefined,
	);
	const matchName = StationsBoard.matchName(tournament, notice.matchId);

	return teams.flatMap((team, idx) => {
		const opponent = teams[1 - idx];
		if (!team || !opponent) return [];

		const meta = {
			tournamentId: tournament.ctx.id,
			matchId: notice.matchId,
			station: stationLabel(station),
			matchName,
			opponentTeamName: opponent.name,
		};

		return [
			{
				userIds: team.memberUserIds,
				notification: {
					type:
						notice.previousStationId === null
							? "TO_MATCH_STATION_ASSIGNED"
							: "TO_MATCH_STATION_MOVED",
					meta,
					pictureUrl: tournament.ctx.logoUrl,
				},
			},
		];
	});
}

function stationLabel(
	station: Pick<Tables["TournamentStation"], "name" | "locationNote">,
) {
	return station.locationNote
		? `${station.name} (${station.locationNote})`
		: station.name;
}

function isPlayable(tournament: StationNoticeTournament, matchId: number) {
	return (
		tournament.matchIdToBracketIdx(matchId) !== null &&
		tournament.matchStatusById(matchId) === "STARTED"
	);
}
