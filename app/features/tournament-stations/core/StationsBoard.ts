/**
 * The stations board of a LAN tournament: which unfinished matches are queued on each station and in
 * what order, which of them is played now and next, the playable matches still waiting for a station
 * (in play order), when the matches not played yet are expected to start and the name a match goes by on the board.
 */
import type { Tables } from "~/db/tables";
import type { MatchStatus } from "~/features/tournament-bracket/core/engine/status";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as EtaSimulation from "./EtaSimulation";
import * as PlayOrder from "./PlayOrder";

/** A match as shown on the stations board. */
export interface StationsBoardMatch {
	id: number;
	/** E.g. "Winners Round 2.3". */
	roundName: string | null;
	/** Only when the tournament has more than one bracket. */
	bracketName: string | null;
	/** `null` while the team is not known yet. */
	teams: [StationsBoardTeam | null, StationsBoardTeam | null];
	/** Games won by each team so far. */
	score: [number, number];
	/** Both teams known and free to play it. */
	isPlayable: boolean;
	/** `"NOW"`: the station's first queued match that is playable, `"NEXT"`: the one played after it. */
	slot: "NOW" | "NEXT" | null;
	/** Put on its station by auto-assignment, not by an organizer. */
	isAutoAssigned: boolean;
	/** Kept in the Waiting lane by an organizer while the tournament auto-assigns stations, which leaves it there. */
	isHeld: boolean;
	/** Estimated minutes until it starts, `null` for the match played now or when there's no estimate worth showing. */
	startsIn: { min: number; max: number } | null;
}

interface StationsBoardTeam {
	id: number;
	name: string;
}

export interface StationsBoardStation {
	id: number;
	name: string;
	locationNote: string | null;
	/** Unfinished matches queued on the station, in the order they are played. */
	matches: StationsBoardMatch[];
}

/**
 * The stations board of a started tournament: each station's queue without its finished matches, plus the
 * playable matches on no station (the Waiting lane) in play order.
 */
export function build({
	tournament,
	stations,
	placements,
	matchStarts,
	now,
}: {
	tournament: Tournament;
	/** In their order. */
	stations: Array<
		Pick<Tables["TournamentStation"], "id" | "name" | "locationNote">
	>;
	/** Each station's queue in order, finished matches included, and the matches kept in Waiting (`stationId: null`). */
	placements: Array<
		Pick<
			Tables["TournamentMatchStation"],
			"matchId" | "stationId" | "isAutoAssigned"
		>
	>;
	/** Estimated starts of the matches, see {@link EtaSimulation.simulate}. */
	matchStarts: Map<number, EtaSimulation.EtaRange>;
	/** Timestamp in milliseconds. */
	now: number;
}): { stations: StationsBoardStation[]; waiting: StationsBoardMatch[] } {
	const matches = boardMatchesById(tournament);
	const playOrder = PlayOrder.byMatchId(tournament);
	const queuedMatchIds = new Set(
		placements.flatMap((row) => (row.stationId === null ? [] : [row.matchId])),
	);
	const heldMatchIds = new Set(
		placements.flatMap((row) => (row.stationId === null ? [row.matchId] : [])),
	);
	const startsIn = (match: StationsBoardMatch) => {
		const range = matchStarts.get(match.id);

		return match.slot === "NOW" || !range
			? null
			: EtaSimulation.minutesFromNow(range, now);
	};

	return {
		stations: stations.map((station) => ({
			id: station.id,
			name: station.name,
			locationNote: station.locationNote,
			matches: withSlots(
				placements
					.filter((row) => row.stationId === station.id)
					.flatMap((row) => {
						const match = matches.get(row.matchId);
						return match && match.status !== "COMPLETED"
							? [
									{
										...match.boardMatch,
										isAutoAssigned: Boolean(row.isAutoAssigned),
									},
								]
							: [];
					}),
			).map((match) => ({ ...match, startsIn: startsIn(match) })),
		})),
		waiting: Array.from(matches.values())
			.filter(
				(match) => match.status === "STARTED" && !queuedMatchIds.has(match.id),
			)
			.toSorted(
				(a, b) =>
					(playOrder.get(a.id)?.rank ?? 0) - (playOrder.get(b.id)?.rank ?? 0),
			)
			.map((match) => ({
				...match.boardMatch,
				isHeld: tournament.autoAssignsStations && heldMatchIds.has(match.id),
				startsIn: startsIn(match.boardMatch),
			})),
	};
}

/** Name of the match as the board shows it, e.g. "Winners Round 2.1", prefixed by the bracket name when the tournament has several brackets. */
export function matchName(tournament: Tournament, matchId: number) {
	const { bracketName, roundName } = tournament.matchContextNamesById(matchId);
	const showBracketName = tournament.ctx.settings.bracketProgression.length > 1;

	return [showBracketName ? bracketName : null, roundName]
		.filter(Boolean)
		.join(" · ");
}

function boardMatchesById(tournament: Tournament) {
	const startedBrackets = tournament.brackets.filter(
		(bracket) => !bracket.preview,
	);
	const showBracketName = tournament.ctx.settings.bracketProgression.length > 1;

	const result = new Map<
		number,
		{
			id: number;
			status: MatchStatus;
			boardMatch: StationsBoardMatch;
		}
	>();

	for (const bracket of startedBrackets) {
		const statuses = bracket.matchStatuses();
		for (const match of bracket.data.match) {
			const status = statuses.get(match.id);
			if (!status) continue;

			result.set(match.id, {
				id: match.id,
				status,
				boardMatch: {
					id: match.id,
					roundName:
						tournament.matchContextNamesById(match.id).roundName ?? null,
					bracketName: showBracketName ? bracket.name : null,
					teams: [
						boardTeam(tournament, match.opponent1?.id),
						boardTeam(tournament, match.opponent2?.id),
					],
					score: [match.opponent1?.score ?? 0, match.opponent2?.score ?? 0],
					isPlayable: status === "STARTED",
					slot: null,
					isAutoAssigned: false,
					isHeld: false,
					startsIn: null,
				},
			});
		}
	}

	return result;
}

function boardTeam(
	tournament: Tournament,
	teamId: number | null | undefined,
): StationsBoardTeam | null {
	if (typeof teamId !== "number") return null;

	const team = tournament.teamById(teamId);
	if (!team) return null;

	return { id: team.id, name: team.name };
}

function withSlots(matches: StationsBoardMatch[]): StationsBoardMatch[] {
	const nowIdx = matches.findIndex((match) => match.isPlayable);
	const nextIdx = matches.findIndex((_, idx) => idx !== nowIdx);

	return matches.map((match, idx) => ({
		...match,
		slot: idx === nowIdx ? "NOW" : idx === nextIdx ? "NEXT" : null,
	}));
}
