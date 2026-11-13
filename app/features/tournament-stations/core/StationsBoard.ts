/**
 * The stations board of a LAN tournament: which unfinished matches are queued on each station and in
 * what order, which of them is played now and next, the playable matches still waiting for a station
 * and the name a match goes by on the board.
 */
import type { Tables } from "~/db/tables";
import type { MatchStatus } from "~/features/tournament-bracket/core/engine/status";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

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
 * playable matches on no station (the Waiting lane), earlier rounds first.
 */
export function build({
	tournament,
	stations,
	queuedMatches,
}: {
	tournament: Tournament;
	/** In their order. */
	stations: Array<
		Pick<Tables["TournamentStation"], "id" | "name" | "locationNote">
	>;
	/** Each station's queue in order, finished matches included. */
	queuedMatches: Array<{ matchId: number; stationId: number }>;
}): { stations: StationsBoardStation[]; waiting: StationsBoardMatch[] } {
	const matches = boardMatchesById(tournament);
	const queuedMatchIds = new Set(queuedMatches.map((row) => row.matchId));

	return {
		stations: stations.map((station) => ({
			id: station.id,
			name: station.name,
			locationNote: station.locationNote,
			matches: withSlots(
				queuedMatches
					.filter((row) => row.stationId === station.id)
					.flatMap((row) => {
						const match = matches.get(row.matchId);
						return match && match.status !== "COMPLETED"
							? [match.boardMatch]
							: [];
					}),
			),
		})),
		waiting: Array.from(matches.values())
			.filter(
				(match) => match.status === "STARTED" && !queuedMatchIds.has(match.id),
			)
			.toSorted((a, b) => compareSortKeys(a.sortKey, b.sortKey))
			.map((match) => match.boardMatch),
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

const SECTION_ORDER = { winners: 0, losers: 1, finals: 2 } as const;

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
			sortKey: number[];
			boardMatch: StationsBoardMatch;
		}
	>();

	for (const bracket of startedBrackets) {
		const statuses = bracket.matchStatuses();
		const roundsById = new Map(
			bracket.data.round.map((round) => [round.id, round]),
		);

		for (const match of bracket.data.match) {
			const status = statuses.get(match.id);
			if (!status) continue;

			const round = roundsById.get(match.roundId);
			const isFinalsSection = round?.section === "finals";

			result.set(match.id, {
				id: match.id,
				status,
				sortKey: [
					bracket.idx,
					isFinalsSection ? 1 : 0,
					round?.number ?? 0,
					round?.section ? SECTION_ORDER[round.section] : 0,
					match.number,
				],
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

function compareSortKeys(a: number[], b: number[]) {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}

	return 0;
}
