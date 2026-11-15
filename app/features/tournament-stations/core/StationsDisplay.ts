/**
 * The station display screen of a LAN tournament: a public, read-only view of the stations board for a screen at the
 * venue. Each station shows the match played on it now and the one after it, the teams of a match not known yet by
 * the match they come from ("Winner of Winners Round 2.3"), and the playable matches waiting for a station.
 */
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type * as EtaSimulation from "./EtaSimulation";
import * as StationsBoard from "./StationsBoard";

/** A match as the display screen shows it. */
export interface StationsDisplayMatch {
	id: number;
	/** E.g. "Winners Round 2.3", prefixed by the bracket name when the tournament has several brackets. */
	name: string;
	sides: [StationsDisplaySide, StationsDisplaySide];
	/** Games won by each team so far. */
	score: [number, number];
	/** When the match is expected to start, only for a station's next match. */
	eta: EtaSimulation.EtaRange | null;
}

/** A team of a match, the match its team comes from while it's not known yet, `null` when neither is known. */
export type StationsDisplaySide =
	| { type: "TEAM"; name: string }
	| { type: "WINNER_OF" | "LOSER_OF"; matchName: string }
	| null;

export interface StationsDisplayStation {
	id: number;
	name: string;
	locationNote: string | null;
	/** The station's first playable queued match. */
	now: StationsDisplayMatch | null;
	/** The match played on the station after `now`. */
	next: StationsDisplayMatch | null;
}

/** The display screen of the tournament's stations board, see {@link StationsBoard.build}. */
export function build({
	tournament,
	board,
	matchStarts,
}: {
	tournament: Tournament;
	board: ReturnType<typeof StationsBoard.build>;
	/** Estimated starts of the matches, see {@link EtaSimulation.simulate}. */
	matchStarts: Map<number, EtaSimulation.EtaRange>;
}): {
	stations: StationsDisplayStation[];
	waiting: StationsDisplayMatch[];
} {
	const feeders = feederMatchesByMatchId(tournament);
	const displayMatch = (
		match: StationsBoard.StationsBoardMatch,
	): StationsDisplayMatch => ({
		id: match.id,
		name: StationsBoard.matchName(tournament, match.id),
		sides: [
			displaySide({ tournament, match, side: "opponent1", feeders }),
			displaySide({ tournament, match, side: "opponent2", feeders }),
		],
		score: match.score,
		eta: match.slot === "NEXT" ? (matchStarts.get(match.id) ?? null) : null,
	});
	const inSlot = (
		station: StationsBoard.StationsBoardStation,
		slot: "NOW" | "NEXT",
	) => {
		const match = station.matches.find((candidate) => candidate.slot === slot);

		return match ? displayMatch(match) : null;
	};

	return {
		stations: board.stations.map((station) => ({
			id: station.id,
			name: station.name,
			locationNote: station.locationNote,
			now: inSlot(station, "NOW"),
			next: inSlot(station, "NEXT"),
		})),
		waiting: board.waiting.map(displayMatch),
	};
}

function feederMatchesByMatchId(tournament: Tournament) {
	return new Map(
		tournament.brackets
			.filter((bracket) => !bracket.preview)
			.flatMap((bracket) => [
				...Engine.feederMatchesByMatchId(bracket.data).entries(),
			]),
	);
}

function displaySide({
	tournament,
	match,
	side,
	feeders,
}: {
	tournament: Tournament;
	match: StationsBoard.StationsBoardMatch;
	side: Engine.Side;
	feeders: Map<number, Engine.FeederMatch[]>;
}): StationsDisplaySide {
	const team = match.teams[side === "opponent1" ? 0 : 1];
	if (team) return { type: "TEAM", name: team.name };

	const feeder = feeders
		.get(match.id)
		?.find((candidate) => candidate.side === side);
	if (!feeder) return null;

	return {
		type: feeder.outcome === "WINNER" ? "WINNER_OF" : "LOSER_OF",
		matchName: StationsBoard.matchName(tournament, feeder.matchId),
	};
}
