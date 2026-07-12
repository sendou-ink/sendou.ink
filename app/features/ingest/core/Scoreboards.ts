import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type {
	IngestedEventInput,
	ScoreboardEventInput,
} from "../ingest-schemas";
import {
	MAIN_WEAPON_IDS,
	MODE_SHORT_BY_ENGLISH_NAME,
	STAGE_ID_BY_ENGLISH_NAME,
} from "./game-names";

/** Lobby header value scoreboards of tournament games are expected to have. */
const TOURNAMENT_LOBBY = "Private Battle";

/**
 * Two scoreboards this close in the source video with identical contents are
 * considered duplicate detections of the same game.
 */
const DUPLICATE_SCOREBOARD_WINDOW_SECONDS = 300;

/**
 * How many of the 8 player rows must carry the same readable name in the
 * same position for a scoreboard to count as a re-detection of a game's
 * already stored scoreboard (allows a couple of OCR misreads).
 */
const MIN_STORED_DUPLICATE_NAME_MATCHES = 6;

/** How many players on the winning (first) resp. losing side of a scoreboard. */
const PLAYERS_PER_TEAM = 4;

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
	abilities?: string[][]; // xxx: improve types incl. this
	/** set only via povIndex attribution */
	userId?: number;
}

export interface IngestedScoreboardData {
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

/**
 * Matches scoreboard events against the games the POV user played and turns
 * them into insertable scoreboard rows.
 *
 * Events and games are both walked in chronological order: each scoreboard is
 * assigned to the next not-yet-assigned game with the same mode and stage
 * whose sides don't contradict the teams' known in-game names (the winning
 * scoreboard rows should overlap the game winner's roster, not the loser's).
 * Scoreboards from other lobbies, with unreadable mode/stage or duplicated
 * detections of the same game are skipped.
 *
 * Scoreboards of one session may arrive over many requests (one per match),
 * so games whose scoreboard was stored by an earlier request are skipped —
 * unless the incoming scoreboard is a re-detection of the stored one, which
 * is matched to the same game so re-sends stay idempotent and another POV's
 * attribution still lands.
 */
export function matchedScoreboards({
	events,
	games,
}: {
	events: IngestedEventInput[];
	games: IngestableGame[];
}): MatchedScoreboard[] {
	const scoreboards = dedupeScoreboards(
		events
			.filter(isScoreboardEvent)
			.filter(
				(event) => !event.data.lobby || event.data.lobby === TOURNAMENT_LOBBY,
			)
			.sort((a, b) => a.t - b.t),
	);
	const orderedGames = games.toSorted(
		(a, b) => a.playedAt - b.playedAt || a.mapIndex - b.mapIndex,
	);

	const result: MatchedScoreboard[] = [];

	let nextGameIdx = 0;
	for (const scoreboard of scoreboards) {
		const mode = scoreboard.data.mode
			? MODE_SHORT_BY_ENGLISH_NAME.get(scoreboard.data.mode)
			: undefined;
		const stageId = scoreboard.data.stage
			? STAGE_ID_BY_ENGLISH_NAME.get(scoreboard.data.stage)
			: undefined;
		if (mode === undefined || stageId === undefined) continue;

		for (let i = nextGameIdx; i < orderedGames.length; i++) {
			const game = orderedGames[i]!;
			if (game.mode !== mode || game.stageId !== stageId) continue;
			if (game.storedScoreboardPlayerNames) {
				if (!isStoredDuplicate(scoreboard, game.storedScoreboardPlayerNames)) {
					continue;
				}
			} else if (!sidesMatchKnownPlayers(scoreboard, game)) {
				continue;
			}

			result.push(scoreboardToMatchedScoreboard({ scoreboard, game }));
			nextGameIdx = i + 1;
			break;
		}
	}

	return result;
}

function isScoreboardEvent(
	event: IngestedEventInput,
): event is ScoreboardEventInput {
	return event.type === "Scoreboard" || event.type === "ScoreboardReplay";
}

function dedupeScoreboards(sorted: ScoreboardEventInput[]) {
	const result: ScoreboardEventInput[] = [];

	for (const scoreboard of sorted) {
		const isDuplicate = result.some(
			(other) =>
				Math.abs(other.t - scoreboard.t) <=
					DUPLICATE_SCOREBOARD_WINDOW_SECONDS &&
				other.data.mode === scoreboard.data.mode &&
				other.data.stage === scoreboard.data.stage &&
				other.data.players.every(
					(player, i) => player.name === scoreboard.data.players[i]!.name,
				),
		);
		if (!isDuplicate) result.push(scoreboard);
	}

	return result;
}

/**
 * Checks that the scoreboard's sides don't contradict the teams' known
 * rosters: the winning rows should overlap the game winner's in-game names at
 * least as well as the losing team's (and vice versa). A contradiction means
 * the scoreboard belongs to some other game. No overlap at all (e.g. no
 * in-game names set) counts as a pass.
 */
function sidesMatchKnownPlayers(
	scoreboard: ScoreboardEventInput,
	game: IngestableGame,
) {
	const winnerSide = scoreboard.data.players
		.slice(0, PLAYERS_PER_TEAM)
		.map((player) => normalizeInGameName(player.name));
	const loserSide = scoreboard.data.players
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
 * Checks whether a scoreboard is a re-detection of a game's already stored
 * scoreboard: enough player rows carry the same readable name in the same
 * position. Positional comparison keeps two games between the same eight
 * players apart — their row orders and sides practically always differ.
 */
function isStoredDuplicate(
	scoreboard: ScoreboardEventInput,
	storedPlayerNames: string[],
) {
	const matches = scoreboard.data.players.filter((player, i) => {
		const name = normalizeInGameName(player.name);
		const storedName = storedPlayerNames[i]
			? normalizeInGameName(storedPlayerNames[i])
			: "";
		return name !== "" && name === storedName;
	}).length;

	return matches >= MIN_STORED_DUPLICATE_NAME_MATCHES;
}

function normalizeInGameName(name: string) {
	return name.split("#")[0]!.normalize("NFKC").trim().toLowerCase();
}

function scoreboardToMatchedScoreboard({
	scoreboard,
	game,
}: {
	scoreboard: ScoreboardEventInput;
	game: IngestableGame;
}): MatchedScoreboard {
	const players = scoreboard.data.players.map(
		(player, playerIdx): IngestedScoreboardPlayer => {
			const weaponSplId = Number(player.weapon);

			return {
				name: player.name.trim(),
				tournamentTeamId:
					playerIdx < PLAYERS_PER_TEAM ? game.winnerTeamId : game.loserTeamId,
				weaponSplId: MAIN_WEAPON_IDS.has(weaponSplId)
					? (weaponSplId as MainWeaponId)
					: null,
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
		povIndex: scoreboard.data.povIndex,
		data: {
			scores: scoreboard.data.scores,
			players,
		},
	};
}
