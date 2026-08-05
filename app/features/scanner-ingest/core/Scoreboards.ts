import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import type {
	ScannerAbility,
	ScannerLobby,
} from "~/features/scanner/scanner-types";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { normalizeInGameName } from "./Matches";

/** Lobby header value scoreboards of tournament games are expected to have. */
const TOURNAMENT_LOBBY = "PRIVATE";

/**
 * How many of the 8 player rows must carry the same readable name in the
 * same position for a match to count as a re-detection of a game's
 * already stored scoreboard (allows a couple of OCR misreads).
 */
const MIN_STORED_DUPLICATE_NAME_MATCHES = 6;

/** How many players on the winning (first) resp. losing side of a scoreboard. */
const PLAYERS_PER_TEAM = 4;

/**
 * How many matches must align with one tournament's games for content
 * resolution to trust it. A single game's (mode, stage, sides) is common
 * across a user's history; two already carry order.
 */
const MIN_RESOLVED_SCOREBOARDS = 2;

/** A game of a tournament match that ingested scoreboards can be matched against. */
export interface IngestableGame {
	matchGameResultId: number;
	tournamentMatchId: number;
	/** 0-based index of the game within its match */
	mapIndex: number;
	mode: ModeShort;
	stageId: StageId;
	winnerTeamId: number;
	loserTeamId: number | null;
	// xxx: this should not be needed? we get winner or not from the ingested event
	/** known in-game names of the winning team's roster, used to validate scoreboard sides */
	winnerInGameNames: string[];
	/** known in-game names of the losing team's roster, used to validate scoreboard sides */
	loserInGameNames: string[];
	/** database timestamp used to order games chronologically across matches */
	playedAt: number;
	/**
	 * player names (in scoreboard row order) of the game's already stored
	 * scoreboard; null when the game has none yet. Lets matching skip taken
	 * games across requests while recognizing re-detections of the same
	 * scoreboard.
	 */
	storedScoreboardPlayerNames: string[] | null;
}

export interface IngestedScoreboardPlayer {
	name: string;
	tournamentTeamId: number | null;
	weaponSplId: MainWeaponId | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	paint: number | null;
	/** [head, clothes, shoes] ability rows gathered from the match's death screens */
	abilities?: ScannerAbility[][];
	/** set only via povIndex attribution */
	userId?: number;
}

export interface IngestedScoreboardData {
	/** game scores [winner, loser] (0-100; a knockout's winner is 100) */
	scores: [number | null, number | null];
	/** in scoreboard order: rows 0-3 winning team, rows 4-7 losing team */
	players: IngestedScoreboardPlayer[];
}

export interface MatchedScoreboard {
	matchGameResultId: number;
	tournamentMatchId: number;
	mapIndex: number;
	povIndex: number | null;
	data: IngestedScoreboardData;
}

/** A candidate game for content resolution, tagged with its tournament. */
export interface IngestableGameWithTournament extends IngestableGame {
	tournamentId: number;
}

/**
 * Resolves which tournament a request's matches belong to from their content
 * alone: the candidate games (the POV user's reported games across
 * tournaments) are grouped by tournament and each tournament is scored by
 * how many matches `matchedScoreboards` aligns with its games — the same
 * mode+stage sequence walk and roster-side validation that decides what
 * would actually be stored.
 */
export function resolveTournamentId({
	matches,
	games,
}: {
	matches: ScannerMatch[];
	games: IngestableGameWithTournament[];
}): number | null {
	const byTournament = new Map<number, IngestableGameWithTournament[]>();
	for (const game of games) {
		const tournamentGames = byTournament.get(game.tournamentId) ?? [];
		tournamentGames.push(game);
		byTournament.set(game.tournamentId, tournamentGames);
	}

	let best: { tournamentId: number; matched: number } | null = null;
	for (const [tournamentId, tournamentGames] of byTournament) {
		const matched = matchedScoreboards({
			matches,
			games: tournamentGames,
		}).length;
		if (!best || matched > best.matched) {
			best = { tournamentId, matched };
		}
	}

	if (!best || best.matched < MIN_RESOLVED_SCOREBOARDS) return null;
	return best.tournamentId;
}

/**
 * Matches ingested matches against the games the POV user played and turns
 * them into insertable scoreboard rows.
 *
 * Only matches whose winner is known with two full teams qualify (a
 * minimap-only match can never attach — its winner and stats are unread).
 * Matches and games are both walked in chronological order: each match is
 * assigned to the next not-yet-assigned game with the same mode and stage
 * whose sides don't contradict the teams' known in-game names (the winning
 * rows should overlap the game winner's roster, not the loser's). Matches
 * from other lobbies, with unreadable mode/stage or duplicated detections
 * of the same game are skipped.
 *
 * One session's matches may arrive over many requests (one per game), so
 * games whose scoreboard was stored by an earlier request are skipped —
 * unless the incoming match is a re-detection of the stored one, which is
 * matched to the same game so re-sends stay idempotent and another POV's
 * attribution still lands.
 */
export function matchedScoreboards({
	matches,
	games,
}: {
	matches: ScannerMatch[];
	games: IngestableGame[];
}): MatchedScoreboard[] {
	const views = dedupeViews(
		matches
			.map(winnerFirstView)
			.filter((view): view is WinnerFirstView => view !== null)
			.filter((view) => !view.lobby || view.lobby === TOURNAMENT_LOBBY)
			.sort((a, b) => a.order - b.order),
	);
	const orderedGames = games.toSorted(
		(a, b) => a.playedAt - b.playedAt || a.mapIndex - b.mapIndex,
	);

	const result: MatchedScoreboard[] = [];

	let nextGameIdx = 0;
	for (const view of views) {
		if (view.mode === null || view.stage === null) continue;

		for (let i = nextGameIdx; i < orderedGames.length; i++) {
			const game = orderedGames[i]!;
			if (game.mode !== view.mode || game.stageId !== view.stage) continue;
			if (game.storedScoreboardPlayerNames) {
				if (!isStoredDuplicate(view, game.storedScoreboardPlayerNames)) {
					continue;
				}
			} else if (!sidesMatchKnownPlayers(view, game)) {
				continue;
			}

			result.push(viewToMatchedScoreboard({ view, game }));
			nextGameIdx = i + 1;
			break;
		}
	}

	return result;
}

/**
 * A match's players in stored-scoreboard order — winning team's rows first —
 * with unread names as empty strings. Null when the match can't attach: its
 * winner is unknown or either team wasn't fully seen.
 */
interface WinnerFirstView {
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/** game scores [winner, loser] from the match's "Score:" banner */
	scores: [number | null, number | null];
	players: WinnerFirstPlayer[];
	povIndex: number | null;
	/** chronological walk key: wall-clock, else video time, else input order */
	order: number;
}

interface WinnerFirstPlayer {
	name: string;
	weaponId: MainWeaponId | null;
	paint: number | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	abilities?: ScannerAbility[][];
}

function winnerFirstView(
	match: ScannerMatch,
	index: number,
): WinnerFirstView | null {
	if (match.winner === null) return null;
	const winners = match.teams[match.winner];
	const losers = match.teams[match.winner === 0 ? 1 : 0];
	if (
		winners.players.length !== PLAYERS_PER_TEAM ||
		losers.players.length !== PLAYERS_PER_TEAM
	) {
		return null;
	}

	return {
		lobby: match.lobby,
		mode: match.mode,
		stage: match.stage,
		scores: [
			match.matchScores?.[match.winner] ?? null,
			match.matchScores?.[match.winner === 0 ? 1 : 0] ?? null,
		],
		players: [...winners.players, ...losers.players].map((player) => ({
			...player,
			name: player.name ?? "",
		})),
		povIndex:
			match.pov === null
				? null
				: match.pov.team === match.winner
					? match.pov.index
					: PLAYERS_PER_TEAM + match.pov.index,
		order: match.playedAt ?? match.startsAt ?? index,
	};
}

/**
 * Drops re-detections of the same game within one request: same mode and
 * stage with every player row carrying the same name.
 */
function dedupeViews(sorted: WinnerFirstView[]): WinnerFirstView[] {
	const result: WinnerFirstView[] = [];

	for (const view of sorted) {
		const isDuplicate = result.some(
			(other) =>
				other.mode === view.mode &&
				other.stage === view.stage &&
				other.players.every(
					(player, i) => player.name === view.players[i]!.name,
				),
		);
		if (!isDuplicate) result.push(view);
	}

	return result;
}

/**
 * Checks that the view's sides don't contradict the teams' known rosters:
 * the winning rows should overlap the game winner's in-game names at least
 * as well as the losing team's (and vice versa). A contradiction means the
 * match belongs to some other game. No overlap at all (e.g. no in-game
 * names set) counts as a pass.
 */
function sidesMatchKnownPlayers(view: WinnerFirstView, game: IngestableGame) {
	const winnerSide = view.players
		.slice(0, PLAYERS_PER_TEAM)
		.map((player) => normalizeInGameName(player.name));
	const loserSide = view.players
		.slice(PLAYERS_PER_TEAM)
		.map((player) => normalizeInGameName(player.name));

	const knownWinners = game.winnerInGameNames.map(normalizeInGameName);
	const knownLosers = game.loserInGameNames.map(normalizeInGameName);

	const straight =
		nameOverlap(winnerSide, knownWinners) + nameOverlap(loserSide, knownLosers);
	const flipped =
		nameOverlap(winnerSide, knownLosers) + nameOverlap(loserSide, knownWinners);

	return straight >= flipped;
}

function nameOverlap(names: string[], knownNames: string[]) {
	const known = new Set(knownNames.filter(Boolean));
	return names.filter((name) => name && known.has(name)).length;
}

/**
 * Checks whether a match is a re-detection of a game's already stored
 * scoreboard: enough player rows carry the same readable name in the same
 * position. Positional comparison keeps two games between the same eight
 * players apart — their row orders and sides practically always differ.
 */
function isStoredDuplicate(view: WinnerFirstView, storedPlayerNames: string[]) {
	const matches = view.players.filter((player, i) => {
		const name = normalizeInGameName(player.name);
		const storedName = storedPlayerNames[i]
			? normalizeInGameName(storedPlayerNames[i])
			: "";
		return name !== "" && name === storedName;
	}).length;

	return matches >= MIN_STORED_DUPLICATE_NAME_MATCHES;
}

function viewToMatchedScoreboard({
	view,
	game,
}: {
	view: WinnerFirstView;
	game: IngestableGame;
}): MatchedScoreboard {
	const players = view.players.map(
		(player, playerIdx): IngestedScoreboardPlayer => {
			return {
				name: player.name.trim(),
				tournamentTeamId:
					playerIdx < PLAYERS_PER_TEAM ? game.winnerTeamId : game.loserTeamId,
				weaponSplId: player.weaponId,
				ka: player.ka,
				d: player.d,
				s: player.s,
				paint: player.paint,
				...(player.abilities ? { abilities: player.abilities } : null),
			};
		},
	);

	return {
		matchGameResultId: game.matchGameResultId,
		tournamentMatchId: game.tournamentMatchId,
		mapIndex: game.mapIndex,
		povIndex: view.povIndex,
		data: {
			scores: view.scores,
			players,
		},
	};
}
