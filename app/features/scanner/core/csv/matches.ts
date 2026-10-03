/**
 * "Matches" export: one row per game, the same rows the match cards render,
 * for the player's own spreadsheet (win rate by mode, K/D over time, what the
 * enemies ran). Unread values are blank — what a spreadsheet reads as "no
 * data"; `?` stays inside packed cells only. Column names are English keys.
 */
import { formatTime } from "../format";
import { lobbyLabel, mainWeaponLabel, modeLabel, stageLabel } from "../labels";
import type { ScannerMatch, ScannerMatchPlayer } from "../scanner-match";
import { matchResult } from "../sessions";
import { type CsvCell, toCsv } from "./csv";

const HEADER = [
	"played_at",
	"source",
	"at",
	"t_seconds",
	"lobby",
	"mode",
	"stage",
	"result",
	"score_for",
	"score_against",
	"weapon",
	"ka",
	"d",
	"s",
	"paint",
	"teammates",
	"enemies",
	"cast",
	"replay_code",
	"clips",
];

export interface MatchCsvSource {
	/** the session's start ("2026-09-16 19:02") or the VoD file name */
	label: string;
	/** stream/file second the positions count from */
	originT: number;
}

/** `clipCounts` aligns by index with `matches`: how many clips each game produced. */
export function matchesToCsv(
	matches: readonly ScannerMatch[],
	source: MatchCsvSource,
	clipCounts: readonly number[] = [],
): string {
	return toCsv(
		HEADER,
		matches.map((match, index) =>
			matchCells(match, source, clipCounts[index] ?? 0),
		),
	);
}

function matchCells(
	match: ScannerMatch,
	source: MatchCsvSource,
	clips: number,
): CsvCell[] {
	const at = match.startsAt === null ? null : match.startsAt - source.originT;
	const povTeam = match.pov?.team ?? 0;
	const pov = match.pov
		? match.teams[match.pov.team].players[match.pov.index]
		: undefined;
	const result = matchResult(match);
	const scoreFor = match.matchScores?.[povTeam] ?? null;
	const scoreAgainst = match.matchScores?.[povTeam === 0 ? 1 : 0] ?? null;
	const teammates = match.teams[povTeam].players.filter(
		(player) => player !== pov,
	);
	const enemies = match.teams[povTeam === 0 ? 1 : 0].players;

	return [
		match.playedAt === null ? "" : new Date(match.playedAt).toISOString(),
		source.label,
		at === null ? "" : formatTime(at),
		at === null ? "" : Math.max(0, Math.round(at)),
		lobbyLabel(match.lobby),
		modeLabel(match.mode),
		stageLabel(match.stage),
		result === null ? "" : result === "win" ? "WIN" : "LOSS",
		scoreFor,
		scoreAgainst,
		pov ? mainWeaponLabel(pov.weaponId) : "",
		pov?.ka,
		pov?.d,
		pov?.s,
		pov?.paint,
		packPlayers(teammates),
		packPlayers(enemies),
		match.cast ? 1 : "",
		match.replayCode,
		clips,
	];
}

/** `name · weapon · ka/d/s · paint`, `;` separated — the events CSV's convention. */
function packPlayers(players: readonly ScannerMatchPlayer[]): string {
	return players
		.map(
			(p) =>
				`${p.name ?? "?"} · ${mainWeaponLabel(p.weaponId) ?? "?"} · ${p.ka ?? "?"}/${p.d ?? "?"}/${p.s ?? "?"} · ${p.paint ?? "?"}p`,
		)
		.join("; ");
}
