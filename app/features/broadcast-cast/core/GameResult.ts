import type {
	BroadcastGameSummaryPlayer,
	BroadcastInk,
	BroadcastMap,
	BroadcastMatch,
	BroadcastObjectiveRead,
	BroadcastPlayer,
	BroadcastScannedGame,
	BroadcastStoredState,
	BroadcastTeam,
	BroadcastView,
	MatchProgress,
} from "~/features/broadcast/broadcast-types";
import * as InkColor from "~/features/broadcast/core/InkColor";
import { nameSimilarity } from "~/features/scanner/core/text";
import type {
	BroadcastGameResult,
	BroadcastGameResultPlayer,
	BroadcastGameResultTeam,
} from "../broadcast-cast-types";

/** How alike (1 = the same) a name read off the game must be to a roster player's to count as theirs. */
const MIN_NAME_SIMILARITY = 0.6;
/** How much more alike the names read must be to the rosters one way round than the other to tell the teams apart, about two names. */
const MIN_NAMES_LIKENESS_MARGIN = 1.5;
const FULL_COUNT = 100;

/**
 * The game the results scene shows in the view: the featured match's last game the scanner read (`scannedGame`),
 * whichever of the set's games it was, else the last one reported with the teams' rosters. A scanned game is the
 * set's game with its map and mode, the one played last when several have them. Its teams are put in bracket order by
 * the names read matching the rosters when they clearly tell, else by the game's ink colors (the pair's first color
 * going to the team the producer gave it, see `BroadcastInk.isFlipped`). Its ink colors are the ones picked for the
 * game now, as the producer may flip them after it ended. Names not read are filled in from the roster
 * players no read name matched. Its winner is the scanner's, from a results screen or the counter, else the reported
 * one of the set's game it was. `null` when the match has no game to show.
 */
export function resolve({
	match,
	view,
	scannedGame,
	ink,
}: {
	match: BroadcastMatch;
	view: BroadcastView;
	scannedGame: BroadcastStoredState["scannedGame"];
	ink: BroadcastStoredState["ink"];
}): BroadcastGameResult | null {
	const progress = match.progress[view];

	if (scannedGame?.matchId === match.id) {
		const isScannedGameInk =
			ink?.matchId === match.id && ink.resultCount === scannedGame.resultCount;

		return fromScannedGame({
			match,
			progress,
			scannedGame,
			ink: isScannedGameInk
				? { key: ink.key, isFlipped: ink.isFlipped }
				: scannedGame.ink,
		});
	}

	const lastReportedIdx = progress.resultCount - 1;
	const reported = progress.games[lastReportedIdx];
	if (!reported) return null;

	const isGameInk =
		ink?.matchId === match.id && ink.resultCount === lastReportedIdx;

	return {
		gameNumber: lastReportedIdx + 1,
		ink: isGameInk ? { key: ink.key, isFlipped: ink.isFlipped } : null,
		map: reported.map,
		winner: reported.winner,
		isKnockout: false,
		teams: [rosterTeam(match.teams[0]), rosterTeam(match.teams[1])],
		objective: [],
	};
}

function fromScannedGame({
	match,
	progress,
	scannedGame,
	ink,
}: {
	match: BroadcastMatch;
	progress: MatchProgress;
	scannedGame: BroadcastScannedGame;
	ink: BroadcastInk | null;
}): BroadcastGameResult {
	const map =
		scannedGame.mode && scannedGame.stageId !== null
			? { mode: scannedGame.mode, stageId: scannedGame.stageId }
			: null;
	const gameIdx = map ? setGameIdx(progress, map) : null;
	const isSwapped = isScannedSwapped({
		scannedGame,
		teams: match.teams,
		ink,
	});
	const bracketOrder = <T>([first, second]: [T, T]): [T, T] =>
		isSwapped ? [second, first] : [first, second];

	const objective = scannedGame.objective.map(
		(read): BroadcastObjectiveRead => ({
			t: read.t,
			score: bracketOrder(read.score),
			control:
				read.control === null || !isSwapped
					? read.control
					: read.control === 0
						? 1
						: 0,
		}),
	);
	const scannedWinner =
		scannedGame.winner === null
			? null
			: bracketOrder<0 | 1>([0, 1])[scannedGame.winner]!;
	const players = bracketOrder([
		scannedGame.teams[0].players,
		scannedGame.teams[1].players,
	]);
	const scores = finalScores(objective);
	const reportedWinner =
		gameIdx === null ? null : (progress.games[gameIdx]?.winner ?? null);

	return {
		gameNumber: gameIdx === null ? null : gameIdx + 1,
		ink,
		map,
		winner: scannedWinner ?? counterWinner(scores) ?? reportedWinner,
		isKnockout: scannedGame.isKnockout,
		teams: [0, 1].map(
			(idx): BroadcastGameResultTeam => ({
				score: scores[idx]!,
				players: withRosterNames(
					players[idx]!,
					match.teams[idx]?.players ?? [],
				),
			}),
		) as [BroadcastGameResultTeam, BroadcastGameResultTeam],
		objective,
	};
}

/**
 * Index of the set's game played on the map: the last one up to the game being played (or the first after it), as
 * a map can come up more than once in a long set. `null` when no game has it.
 */
function setGameIdx(progress: MatchProgress, map: BroadcastMap) {
	const matching = progress.games.flatMap((game, idx) =>
		game.map?.mode === map.mode && game.map.stageId === map.stageId
			? [idx]
			: [],
	);

	return (
		matching.findLast((idx) => idx <= progress.resultCount) ??
		matching[0] ??
		null
	);
}

/**
 * Whether the scanner's first team is the match's second one: as the names read tell when they clearly do, else by
 * the game's ink colors, else by the names read however little they tell. Names go first as on casts the minimap's
 * inks (which tell the scanner's teams' colors) don't always line up with its teams.
 */
function isScannedSwapped({
	scannedGame,
	teams,
	ink,
}: {
	scannedGame: BroadcastScannedGame;
	teams: BroadcastMatch["teams"];
	ink: BroadcastInk | null;
}) {
	const [first, second] = scannedGame.teams.map((team) => team.players);
	const [firstRoster, secondRoster] = teams.map((team) => team?.players ?? []);
	const straight =
		namesLikeness(first!, firstRoster!) + namesLikeness(second!, secondRoster!);
	const swapped =
		namesLikeness(first!, secondRoster!) + namesLikeness(second!, firstRoster!);
	if (Math.abs(swapped - straight) >= MIN_NAMES_LIKENESS_MARGIN) {
		return swapped > straight;
	}

	const isInPairOrder = ink
		? InkColor.isInPairOrder(scannedGame.inks, ink.key)
		: null;
	if (ink && isInPairOrder !== null) return isInPairOrder === ink.isFlipped;

	return swapped > straight;
}

/** How much the names read are like the roster's, each read name counting its most alike roster player's. */
function namesLikeness(
	players: BroadcastGameSummaryPlayer[],
	roster: BroadcastPlayer[],
) {
	let total = 0;
	for (const { name } of players) {
		if (name === null) continue;

		const best = Math.max(
			0,
			...roster.map((player) => nameSimilarity(name, player.name)),
		);
		if (best >= MIN_NAME_SIMILARITY) total += best;
	}

	return total;
}

/**
 * The players with the names not read taken from the roster players no read name matched: one who plays the
 * player's weapon if any, else in roster order.
 */
function withRosterNames(
	players: BroadcastGameSummaryPlayer[],
	roster: BroadcastPlayer[],
): BroadcastGameResultPlayer[] {
	const unclaimed = roster.filter(
		(rosterPlayer) =>
			!players.some(
				(player) =>
					player.name !== null &&
					nameSimilarity(player.name, rosterPlayer.name) >= MIN_NAME_SIMILARITY,
			),
	);

	return players.map((player) => {
		if (player.name !== null) return player;

		const fill =
			unclaimed.find(
				(rosterPlayer) =>
					player.weaponSplId !== null &&
					rosterPlayer.weapons.includes(player.weaponSplId),
			) ?? unclaimed[0];
		if (!fill) return player;

		unclaimed.splice(unclaimed.indexOf(fill), 1);
		return { ...player, name: fill.name };
	});
}

function rosterTeam(team: BroadcastTeam | null): BroadcastGameResultTeam {
	return {
		score: null,
		players: (team?.players ?? []).map((player) => ({
			name: player.name,
			weaponSplId: null,
			abilities: [],
		})),
	};
}

/** How much of the counter each team took by its last read count, `null` when never read. */
function finalScores(
	objective: BroadcastObjectiveRead[],
): [number | null, number | null] {
	const lastCount = (idx: 0 | 1) =>
		objective.findLast((read) => read.score[idx] !== null)?.score[idx] ?? null;

	return [0, 1].map((idx) => {
		const count = lastCount(idx as 0 | 1);
		return count === null ? null : FULL_COUNT - count;
	}) as [number | null, number | null];
}

/** The team that took more of the counter, `null` when tied or not read. */
function counterWinner([first, second]: [number | null, number | null]):
	| 0
	| 1
	| null {
	if (first === null || second === null || first === second) return null;

	return first > second ? 0 : 1;
}
