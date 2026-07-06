import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import gameMisc from "../../../../locales/en/game-misc.json";
import type {
	IngestedEventInput,
	ScoreboardEventInput,
} from "../ingest-schemas";

const STAGE_ID_BY_ENGLISH_NAME = new Map<string, StageId>(
	stageIds.map((stageId) => [
		(gameMisc as Record<string, string>)[`STAGE_${stageId}`]!,
		stageId,
	]),
);

const MODE_SHORT_BY_ENGLISH_NAME = new Map<string, ModeShort>(
	modesShort.map((modeShort) => [
		(gameMisc as Record<string, string>)[`MODE_LONG_${modeShort}`]!,
		modeShort,
	]),
);

const MAIN_WEAPON_IDS: ReadonlySet<number> = new Set(mainWeaponIds);

/** Lobby header value scoreboards of tournament games are expected to have. */
const TOURNAMENT_LOBBY = "Private Battle";

/**
 * Two scoreboards this close in the source video with identical contents are
 * considered duplicate detections of the same game.
 */
const DUPLICATE_SCOREBOARD_WINDOW_SECONDS = 300;

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
}

export interface IngestedScoreboardPlayer {
	name: string;
	tournamentTeamId: number | null;
	weaponSplId: MainWeaponId | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	paint: number | null;
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
			if (!sidesMatchKnownPlayers(scoreboard, game)) continue;

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
