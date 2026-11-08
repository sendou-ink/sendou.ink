import * as R from "remeda";
import type {
	BracketData,
	MatchData,
} from "~/features/tournament-bracket/core/engine/types";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type {
	BroadcastBracketTeam,
	BroadcastTeamRecord,
	BroadcastTeamSet,
	BroadcastTeamSpotlight,
} from "../broadcast-types";
import * as BracketFocus from "./BracketFocus";

interface GameResult {
	matchId: number;
	mode: ModeShort;
	stageId: StageId;
	winnerTeamId: number;
}

/**
 * The team's tournament so far for the team scene: its sets in the order it played them up to the one being played
 * (or the next one once its opponent or round is known), its record and how it did per mode. The featured match is
 * shown as far as the view shows it, so a result not on air yet doesn't spoil it, neither does its winner advancing.
 */
export function build({
	teamId,
	brackets,
	games,
	featured,
	teamById,
	roundLabelOf,
}: {
	teamId: number;
	/** The tournament's started brackets in the order they were played. */
	brackets: Array<{ data: BracketData }>;
	/** Reported games of the team's sets, in playing order. */
	games: GameResult[];
	featured: BracketFocus.FeaturedMatch | null;
	teamById: (id: number) => BroadcastBracketTeam | null;
	roundLabelOf: (matchId: number) => string;
}): Pick<BroadcastTeamSpotlight, "sets" | "record" | "modes"> {
	const sets: BroadcastTeamSet[] = [];

	for (const match of brackets.flatMap(({ data }) =>
		teamMatchesInPlayingOrder(BracketFocus.asOnAir(data, featured), teamId),
	)) {
		const set = toSet({
			match,
			teamId,
			isFeatured: match.id === featured?.id,
			games: games
				.filter((game) => game.matchId === match.id)
				.slice(
					0,
					match.id === featured?.id ? featured.progress.resultCount : undefined,
				),
			teamById,
			roundLabelOf,
		});
		sets.push(set);

		if (set.status === "upcoming") break;
	}

	return { sets, record: record(sets), modes: modeRecords(sets) };
}

function teamMatchesInPlayingOrder(data: BracketData, teamId: number) {
	const groupNumberById = new Map(
		data.group.map((group) => [group.id, group.number]),
	);
	const roundNumberById = new Map(
		data.round.map((round) => [round.id, round.number]),
	);

	return R.sortBy(
		data.match.filter(
			(match) =>
				match.opponent1 &&
				match.opponent2 &&
				(match.opponent1.id === teamId || match.opponent2.id === teamId),
		),
		// a team plays a double elimination bracket's winners group first, then losers, then the finals
		(match) => groupNumberById.get(match.groupId) ?? 0,
		(match) => roundNumberById.get(match.roundId) ?? 0,
		(match) => match.number,
	);
}

function toSet({
	match,
	teamId,
	isFeatured,
	games,
	teamById,
	roundLabelOf,
}: {
	match: MatchData;
	teamId: number;
	isFeatured: boolean;
	games: GameResult[];
	teamById: (id: number) => BroadcastBracketTeam | null;
	roundLabelOf: (matchId: number) => string;
}): BroadcastTeamSet {
	const ownSide = match.opponent1?.id === teamId ? "opponent1" : "opponent2";
	const own = match[ownSide];
	const opponent = match[ownSide === "opponent1" ? "opponent2" : "opponent1"];
	const hasScores =
		typeof own?.score === "number" || typeof opponent?.score === "number";

	return {
		matchId: match.id,
		roundLabel: roundLabelOf(match.id),
		opponent: typeof opponent?.id === "number" ? teamById(opponent.id) : null,
		scores: [own?.score ?? 0, opponent?.score ?? 0],
		status: match.winnerSide
			? match.winnerSide === ownSide
				? "win"
				: "loss"
			: isFeatured || hasScores
				? "live"
				: "upcoming",
		games: games.map((game) => ({
			mode: game.mode,
			stageId: game.stageId,
			isWin: game.winnerTeamId === teamId,
		})),
	};
}

function record(sets: BroadcastTeamSet[]): BroadcastTeamRecord {
	const played = sets.filter((set) => set.status !== "upcoming");

	return {
		setWins: played.filter((set) => set.status === "win").length,
		setLosses: played.filter((set) => set.status === "loss").length,
		mapWins: R.sumBy(played, (set) => set.scores[0]),
		mapLosses: R.sumBy(played, (set) => set.scores[1]),
	};
}

function modeRecords(sets: BroadcastTeamSet[]) {
	const games = sets.flatMap((set) => set.games);

	return modesShort.flatMap((mode) => {
		const ofMode = games.filter((game) => game.mode === mode);
		if (ofMode.length === 0) return [];

		const wins = ofMode.filter((game) => game.isWin).length;

		return [{ mode, wins, losses: ofMode.length - wins }];
	});
}
