/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Audits death/special detection against scoreboard truth, from an events CSV
 * downloaded from the scanner UI. Rows are parsed back into DetectedEvents,
 * run through the real match builder and rendered into the timeline's status
 * spans; each player's span counts are diffed against the scoreboard's D/S
 * numbers. A special span ending in a death (or held at the final whistle) is
 * a legit non-use and does not count toward S.
 *
 * The CSV is lossy (no ink colors, only top-1 strip-weapon candidates), so
 * cast-footage side orientation and slot→row assignment can degrade to their
 * fallbacks; the output flags mismatches that look like slot-mapping artifacts.
 * Every discrepancy lists the read timestamps most likely to yield a fixture.
 *
 * Usage: pnpm scanner:status-audit <events.csv> [--all]
 */
import { readFileSync } from "node:fs";
import {
	type PlayerStatusTimelineSample,
	statusSpans,
} from "../../app/components/PlayerStatusTimeline";
import { formatTime } from "../../app/features/scanner/components/format";
import {
	lobbyLabel,
	mainWeaponLabel,
	modeLabel,
	stageLabel,
} from "../../app/features/scanner/components/labels";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../../app/features/scanner/core/detectors/death/index";
import { ALL_WEAPON_ENTRIES } from "../../app/features/scanner/core/detectors/death/weapon-names";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../../app/features/scanner/core/detectors/map-start/index";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
	type MinimapEnemy,
	type MinimapTeammate,
} from "../../app/features/scanner/core/detectors/minimap/index";
import type { CardSlot } from "../../app/features/scanner/core/detectors/minimap/rois";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "../../app/features/scanner/core/detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
	type PlayerStatusFlags,
	type PlayerStatusLayout,
} from "../../app/features/scanner/core/detectors/objective/player-status";
import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "../../app/features/scanner/core/detectors/objective/strip-weapons";
import {
	SCOREBOARD_EVENT_TYPE,
	type ScoreboardData,
	type ScoreboardPlayer,
} from "../../app/features/scanner/core/detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../../app/features/scanner/core/detectors/scoreboard-battle-log/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE } from "../../app/features/scanner/core/detectors/scoreboard-battle-log-replay/index";
import type { DetectedEvent } from "../../app/features/scanner/core/detectors/types";
import {
	type BuiltMatch,
	buildScannerMatches,
} from "../../app/features/scanner/core/match-builder";
import type {
	ScannerMatch,
	ScannerMatchPlayerStatusSample,
} from "../../app/features/scanner/core/scanner-match";
import type { ScannerLobby } from "../../app/features/scanner/scanner-types";
import { modesShort } from "../../app/modules/in-game-lists/modes";
import { stageIds } from "../../app/modules/in-game-lists/stage-ids";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "../../app/modules/in-game-lists/types";
import { mainWeaponIds } from "../../app/modules/in-game-lists/weapon-ids";

/** Mirrors PlayerStatusTimeline's MAX_BRIDGE_SECONDS: longer sample gaps render as unobserved. */
const OBSERVATION_GAP_SECONDS = 15;
/** Mirrors match-builder's DEAD_RUN_MIN_SECONDS: no true splat is shorter. */
const MIN_DEAD_SECONDS = 3.5;
const SPAN_EPSILON_SECONDS = 0.001;

const SCOREBOARD_TYPES = new Set([
	SCOREBOARD_EVENT_TYPE,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
]);

const CARD_SLOTS = new Set<CardSlot>(["up", "left", "right", "self", "down"]);

const MODE_BY_LABEL = new Map<string, ModeShort>(
	modesShort.map((mode) => [modeLabel(mode) ?? mode, mode]),
);
const STAGE_BY_LABEL = new Map<string, StageId>(
	stageIds.map((id) => [stageLabel(id) ?? String(id), id]),
);
const MAIN_WEAPON_BY_LABEL = new Map<string, MainWeaponId>(
	mainWeaponIds.map((id) => [mainWeaponLabel(id) ?? String(id), id]),
);
const DEATH_WEAPON_BY_LABEL = new Map(
	ALL_WEAPON_ENTRIES.map((entry) => [entry.name, entry]),
);
const LOBBY_BY_LABEL = new Map<string, ScannerLobby>(
	(["X", "SERIES", "OPEN", "PRIVATE"] as const).map((lobby) => [
		lobbyLabel(lobby) ?? lobby,
		lobby,
	]),
);

const args = process.argv.slice(2);
const csvPath = args.find((arg) => !arg.startsWith("--"));
const showAllSpans = args.includes("--all");
if (!csvPath) {
	console.error("Usage: pnpm scanner:status-audit <events.csv> [--all]");
	process.exit(1);
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const header = rows[0] ?? [];
const col = (name: string) => header.indexOf(name);
const columns = {
	type: col("type"),
	t: col("t_seconds"),
	confidence: col("confidence"),
	lobby: col("lobby"),
	mode: col("mode"),
	stage: col("stage"),
	winnerScore: col("winner_score"),
	loserScore: col("loser_score"),
	pov: col("pov"),
	weapon: col("weapon"),
	name: col("name"),
	abilities: col("abilities"),
	players: col("players"),
	replayCode: col("replay_code"),
	replayTimestamp: col("replay_timestamp"),
};
if (columns.type === -1 || columns.t === -1 || columns.players === -1) {
	console.error(
		`Not an events CSV (missing type/t_seconds/players columns): ${csvPath}`,
	);
	process.exit(1);
}

const events: DetectedEvent[] = [];
const skippedTypes = new Map<string, number>();
const parseFailures: string[] = [];
for (const row of rows.slice(1)) {
	if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;
	const type = row[columns.type] ?? "";
	try {
		const event = eventFromRow(type, row);
		if (event) events.push(event);
		else skippedTypes.set(type, (skippedTypes.get(type) ?? 0) + 1);
	} catch (error) {
		parseFailures.push(
			`t=${row[columns.t]} ${type}: ${error instanceof Error ? error.message : error}`,
		);
	}
}

const built = buildScannerMatches(events);
const candidates: FixtureCandidate[] = [];

printHeader();
for (const [index, builtMatch] of built.entries()) {
	printMatch(index, builtMatch);
}
printCandidates();
printGuidance();

function parseCsv(text: string): string[][] {
	const result: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') {
				quoted = false;
			} else {
				cell += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ",") {
			row.push(cell);
			cell = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cell);
			result.push(row);
			row = [];
			cell = "";
		} else {
			cell += ch;
		}
	}
	if (cell !== "" || row.length > 0) {
		row.push(cell);
		result.push(row);
	}
	return result;
}

function eventFromRow(type: string, row: string[]): DetectedEvent | null {
	const base = {
		t: Number(row[columns.t]),
		confidence: Number(row[columns.confidence] || 0),
	};
	if (Number.isNaN(base.t)) throw new Error("unparseable t_seconds");
	const players = row[columns.players] ?? "";

	if (type === PLAYER_STATUS_EVENT_TYPE) {
		return { type, ...base, data: parsePlayerStatusCell(players) };
	}
	if (type === OBJECTIVE_EVENT_TYPE) {
		return { type, ...base, data: parseObjectiveCell(players) };
	}
	if (type === STRIP_WEAPONS_EVENT_TYPE) {
		return { type, ...base, data: parseStripWeaponsCell(players) };
	}
	if (type === MINIMAP_EVENT_TYPE) {
		return {
			type,
			...base,
			data: parseMinimapCell(players, row[columns.stage] ?? ""),
		};
	}
	if (type === MAP_START_EVENT_TYPE) {
		const data: MapStartData = {
			mode: MODE_BY_LABEL.get(row[columns.mode] ?? "") ?? null,
			stage: STAGE_BY_LABEL.get(row[columns.stage] ?? "") ?? null,
		};
		return { type, ...base, data };
	}
	if (type === DEATH_EVENT_TYPE) {
		return { type, ...base, data: parseDeathRow(row) };
	}
	if (SCOREBOARD_TYPES.has(type)) {
		return { type, ...base, data: parseScoreboardRow(row) };
	}
	return null;
}

function parseClock(m: string, s: string): number {
	return Number(m) * 60 + Number(s);
}

function parsePlayerStatusCell(cell: string): PlayerStatusData {
	const match = cell.match(
		/^(?:(\d+):(\d{2}) · )?([✕★·]{4}) vs ([✕★·]{4}) \((even|narrow-right|narrow-left)\)$/u,
	);
	if (!match) throw new Error(`bad PlayerStatus cell: ${cell}`);
	const [, m, s, left, right, layout] = match;
	const sideFlags = (icons: string) => {
		const chars = [...icons];
		return {
			dead: chars.map((c) => c === "✕") as PlayerStatusFlags,
			special: chars.map((c) => c === "★") as PlayerStatusFlags,
		};
	};
	const a = sideFlags(left!);
	const b = sideFlags(right!);
	return {
		time: m === undefined ? null : parseClock(m, s!),
		special: [a.special, b.special],
		dead: [a.dead, b.dead],
		layout: layout as PlayerStatusLayout,
		// the CSV carries no camera-badge evidence
		cast: null,
	};
}

function parseObjectiveCell(cell: string): ObjectiveData {
	const match = cell.match(
		/^(?:(\d+):(\d{2}) · )?(\d+|\?)(?: \(\+(\d+)\))?( ctrl)? vs (\d+|\?)(?: \(\+(\d+)\))?( ctrl)?$/u,
	);
	if (!match) throw new Error(`bad Objective cell: ${cell}`);
	const [, m, s, scoreA, penA, ctrlA, scoreB, penB, ctrlB] = match;
	const num = (v: string | undefined) =>
		v === undefined || v === "?" ? null : Number(v);
	return {
		mode: "SZ",
		time: m === undefined ? null : parseClock(m, s!),
		score: [num(scoreA), num(scoreB)],
		penalty: [num(penA), num(penB)],
		control: [ctrlA !== undefined, ctrlB !== undefined],
		teamColor: [null, null],
	};
}

function parseStripWeaponsCell(cell: string): StripWeaponsData {
	const match = cell.match(
		/^(?:(\d+):(\d{2}) · )?(.*) vs (.*) \((even|narrow-right|narrow-left)\)$/u,
	);
	if (!match) throw new Error(`bad StripWeapons cell: ${cell}`);
	const [, m, s, left, right, layout] = match;
	const side = (text: string) =>
		text.split(" | ").map((entry) => {
			if (entry === "✕") return null;
			if (entry === "?") return [];
			const weaponId = MAIN_WEAPON_BY_LABEL.get(entry);
			return weaponId === undefined ? [] : [{ weaponId, score: 1 }];
		});
	return {
		time: m === undefined ? null : parseClock(m, s!),
		layout: layout as PlayerStatusLayout,
		slots: [side(left!), side(right!)],
	};
}

function parseAbilityTokens(text: string): (AbilityWithUnknown | null)[] {
	if (text === "") return [];
	return text
		.split("+")
		.map((token) => (token === "?" ? null : (token as AbilityWithUnknown)));
}

function parseMinimapCell(cell: string, stageCell: string): MinimapData {
	const teammates: MinimapTeammate[] = [];
	const enemies: MinimapEnemy[] = [];
	for (const entry of cell === "" ? [] : cell.split("; ")) {
		const parts = entry.split(" · ");
		let specialReady = false;
		let dead = false;
		if (parts.at(-1) === "special") {
			specialReady = true;
			parts.pop();
		}
		if (parts.at(-1) === "splatted") {
			dead = true;
			parts.pop();
		}
		if (parts.length < 3) throw new Error(`bad Minimap entry: ${entry}`);
		const abilities = parseAbilityTokens(parts.pop()!);
		const weaponCell = parts.pop()!;
		const weaponId =
			weaponCell === "?"
				? null
				: (MAIN_WEAPON_BY_LABEL.get(weaponCell) ?? null);
		const head = parts.join(" · ");
		const spaceAt = head.indexOf(" ");
		const label = spaceAt === -1 ? head : head.slice(0, spaceAt);
		const rawName = spaceAt === -1 ? "" : head.slice(spaceAt + 1);
		const name = rawName === "?" || rawName === "" ? null : rawName;
		const player = { name, weaponId, abilities, dead, specialReady };
		if (CARD_SLOTS.has(label as CardSlot)) {
			teammates.push({ slot: label as CardSlot, ...player });
		} else if (/^enemy[1-4]$/.test(label)) {
			enemies.push(player);
		} else {
			throw new Error(`bad Minimap slot label: ${label}`);
		}
	}
	return {
		stage: STAGE_BY_LABEL.get(stageCell) ?? null,
		spectator: enemies.some((enemy) => enemy.name !== null),
		teammates,
		enemies,
		teamColors: [null, null],
	};
}

function parseDeathRow(row: string[]): DeathData {
	const weaponCell = row[columns.weapon] ?? "";
	const entry = DEATH_WEAPON_BY_LABEL.get(weaponCell);
	const abilitiesCell = row[columns.abilities] ?? "";
	const nameCell = row[columns.name] ?? "";
	return {
		weaponId:
			entry === undefined ? null : (Number(entry.id) as DeathData["weaponId"]),
		weaponType: entry?.type ?? null,
		abilities:
			abilitiesCell === ""
				? []
				: abilitiesCell
						.split(" | ")
						.map(
							(gearRow) => parseAbilityTokens(gearRow) as AbilityWithUnknown[],
						),
		name: nameCell === "" ? null : nameCell,
	};
}

function parseScoreboardRow(row: string[]): ScoreboardData & {
	replayCode?: string | null;
	timestamp?: string | null;
} {
	const players: ScoreboardPlayer[] = [];
	const cell = row[columns.players] ?? "";
	for (const entry of cell === "" ? [] : cell.split("; ")) {
		const parts = entry.split(" · ");
		const stats = parts
			.pop()
			?.match(/^(\d+|\?)p (\d+|\?)\/(\d+|\?)\/(\d+|\?)$/u);
		const weaponCell = parts.pop();
		const head = parts.join(" · ");
		if (!stats || weaponCell === undefined || !/^[WL] /.test(head)) {
			throw new Error(`bad Scoreboard player entry: ${entry}`);
		}
		const num = (v: string) => (v === "?" ? null : Number(v));
		players.push({
			name: head.slice(2),
			weaponId:
				weaponCell === "?" ? null : (Number(weaponCell) as MainWeaponId),
			paint: num(stats[1]!),
			ka: num(stats[2]!),
			d: num(stats[3]!),
			s: num(stats[4]!),
		});
	}
	const score = (cellValue: string | undefined) =>
		cellValue === undefined || cellValue === "" ? null : Number(cellValue);
	const povName = row[columns.pov] ?? "";
	const povIndex = players.findIndex((p) => p.name === povName);
	const replayCode = row[columns.replayCode] ?? "";
	const timestamp = row[columns.replayTimestamp] ?? "";
	return {
		lobby: LOBBY_BY_LABEL.get(row[columns.lobby] ?? "") ?? null,
		mode: MODE_BY_LABEL.get(row[columns.mode] ?? "") ?? null,
		stage: STAGE_BY_LABEL.get(row[columns.stage] ?? "") ?? null,
		matchScores: [
			score(row[columns.winnerScore]),
			score(row[columns.loserScore]),
		],
		players,
		povIndex: povName === "" || povIndex === -1 ? null : povIndex,
		replayCode: replayCode === "" ? null : replayCode,
		timestamp: timestamp === "" ? null : timestamp,
	};
}

interface FixtureCandidate {
	score: number;
	t: number;
	matchIndex: number;
	description: string;
	reads: number[];
}

interface TimeWindow {
	start: number;
	end: number;
}

interface StatusSpan extends TimeWindow {
	/** sample timestamps that read the flag true inside the span */
	confirmingReads: number[];
	/**
	 * widest the true state could have held: from the last false read before the
	 * span to the false read that closed it (the builder's flank-to-flank measure);
	 * the rendered span bounds where a flank is unobserved
	 */
	maxPossibleSeconds: number;
}

interface SlotAnalysis {
	side: 0 | 1;
	slot: number;
	deadSpans: StatusSpan[];
	specialSpans: StatusSpan[];
	specialUses: number;
	diedWithSpecial: number;
	heldAtEnd: boolean;
	unknownSpecialEnds: number;
}

function annotatedSpans(
	samples: readonly ScannerMatchPlayerStatusSample[],
	flagOf: (sample: PlayerStatusTimelineSample) => boolean,
): StatusSpan[] {
	return statusSpans(samples, flagOf).map((span) => {
		const confirmingReads = samples
			.filter(
				(sample) =>
					flagOf(sample) &&
					sample.t >= span.start - SPAN_EPSILON_SECONDS &&
					sample.t <= span.end + SPAN_EPSILON_SECONDS,
			)
			.map((sample) => sample.t);
		const prev = samples.findLast(
			(sample) => sample.t < span.start - SPAN_EPSILON_SECONDS,
		);
		const closedByFalseRead = samples.some(
			(sample) =>
				!flagOf(sample) &&
				Math.abs(sample.t - span.end) <= SPAN_EPSILON_SECONDS,
		);
		const boundedBefore = prev !== undefined && !flagOf(prev);
		return {
			start: span.start,
			end: span.end,
			confirmingReads,
			maxPossibleSeconds:
				boundedBefore && closedByFalseRead
					? span.end - prev.t
					: Number.POSITIVE_INFINITY,
		};
	});
}

function analyzeSlot(
	samples: readonly ScannerMatchPlayerStatusSample[],
	side: 0 | 1,
	slot: number,
): SlotAnalysis {
	const deadSpans = annotatedSpans(samples, (s) => s.dead[side][slot]!);
	const specialSpans = annotatedSpans(samples, (s) => s.special[side][slot]!);

	let specialUses = 0;
	let diedWithSpecial = 0;
	let unknownSpecialEnds = 0;
	for (let i = 1; i < samples.length; i++) {
		const prev = samples[i - 1]!;
		const cur = samples[i]!;
		if (!prev.special[side][slot] || cur.special[side][slot]) continue;
		if (cur.t - prev.t > OBSERVATION_GAP_SECONDS) unknownSpecialEnds++;
		else if (cur.dead[side][slot]) diedWithSpecial++;
		else specialUses++;
	}
	const last = samples.at(-1);
	const heldAtEnd = last !== undefined && last.special[side][slot] === true;

	return {
		side,
		slot,
		deadSpans,
		specialSpans,
		specialUses,
		diedWithSpecial,
		heldAtEnd,
		unknownSpecialEnds,
	};
}

function observationGaps(
	samples: readonly ScannerMatchPlayerStatusSample[],
): TimeWindow[] {
	const gaps: TimeWindow[] = [];
	for (let i = 1; i < samples.length; i++) {
		const dt = samples[i]!.t - samples[i - 1]!.t;
		if (dt > OBSERVATION_GAP_SECONDS) {
			gaps.push({ start: samples[i - 1]!.t, end: samples[i]!.t });
		}
	}
	return gaps;
}

function readsInWindow(
	sources: readonly DetectedEvent[],
	start: number,
	end: number,
): number[] {
	return sources
		.filter(
			(event) =>
				(event.type === PLAYER_STATUS_EVENT_TYPE ||
					event.type === MINIMAP_EVENT_TYPE) &&
				event.t >= start - 0.5 &&
				event.t <= end + 0.5,
		)
		.map((event) => Math.round(event.t * 100) / 100);
}

function ts(t: number): string {
	return `t=${Math.round(t * 10) / 10} (${formatTime(t)})`;
}

function spanText(span: StatusSpan, suspicions: string[]): string {
	const duration = Math.round((span.end - span.start) * 10) / 10;
	const marks = suspicions.length > 0 ? ` ⚠ ${suspicions.join(", ")}` : "";
	return `${ts(span.start)} ${duration}s/${span.confirmingReads.length}r${marks}`;
}

function deadSpanSuspicions(span: StatusSpan): string[] {
	const suspicions: string[] = [];
	if (span.maxPossibleSeconds < MIN_DEAD_SECONDS) {
		suspicions.push(
			`even flank-to-flank shorter than min respawn ${MIN_DEAD_SECONDS}s`,
		);
	}
	if (span.confirmingReads.length === 1) suspicions.push("single read");
	return suspicions;
}

function specialSpanSuspicions(span: StatusSpan): string[] {
	return span.confirmingReads.length === 1 ? ["single read"] : [];
}

function playerLabelOf(match: ScannerMatch, side: 0 | 1, slot: number): string {
	const player = match.teams[side].players[slot];
	const weapon = mainWeaponLabel(player?.weaponId ?? null);
	return `${player?.name ?? "?"}${weapon ? ` · ${weapon}` : ""}`;
}

function printHeader(): void {
	console.log(`# Player-status audit: ${csvPath}`);
	const counts = new Map<string, number>();
	for (const event of events) {
		counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
	}
	const countText = [...counts.entries()]
		.map(([type, n]) => `${type} ${n}`)
		.join(", ");
	console.log(`events reconstructed: ${events.length} (${countText})`);
	for (const [type, n] of skippedTypes) {
		console.log(`ignored: ${n} × ${type} (not used by the match builder)`);
	}
	for (const failure of parseFailures) {
		console.log(`PARSE FAILURE (row skipped): ${failure}`);
	}
	console.log(`matches built: ${built.length}`);
	console.log("");
}

function printMatch(
	index: number,
	builtMatch: BuiltMatch<DetectedEvent>,
): void {
	const { match, sources } = builtMatch;
	const headline = [
		match.mode ? modeLabel(match.mode) : "mode?",
		match.stage !== null ? stageLabel(match.stage) : "stage?",
		match.startsAt !== null && match.endsAt !== null
			? `${ts(match.startsAt)} – ${ts(match.endsAt)}`
			: "span?",
		match.cast ? "cast footage" : "POV footage",
	].join(" · ");
	console.log(`## Match ${index + 1} · ${headline}`);

	const samples = match.playerStatus?.samples ?? [];
	if (samples.length === 0) {
		console.log(
			match.mode !== null && match.mode !== "SZ"
				? "no status samples (non-SZ match: counter/status reads voided as lookalike misreads)"
				: "no status samples — nothing to audit",
		);
		console.log("");
		return;
	}

	const sorted = samples.toSorted((a, b) => a.t - b.t);
	const gaps = observationGaps(sorted);
	const windowSeconds = sorted.at(-1)!.t - sorted[0]!.t;
	const gapSeconds = gaps.reduce((acc, gap) => acc + (gap.end - gap.start), 0);
	const coverage =
		windowSeconds <= 0 ? 1 : (windowSeconds - gapSeconds) / windowSeconds;
	console.log(
		`status samples: ${sorted.length} over ${ts(sorted[0]!.t)} – ${ts(sorted.at(-1)!.t)} · observed ${Math.round(coverage * 100)}% of the window`,
	);
	for (const gap of gaps) {
		console.log(
			`  unobserved gap: ${ts(gap.start)} → ${ts(gap.end)} (${Math.round(gap.end - gap.start)}s) — deaths/specials in here are invisible to the timeline`,
		);
	}

	const hasScoreboard = match.winner !== null;
	if (!hasScoreboard) {
		console.log(
			"no scoreboard closed this match — no ground truth to diff against; flagging only implausible spans",
		);
	}

	for (const side of [0, 1] as const) {
		const teamLabel =
			match.winner === null
				? `Team ${side + 1}`
				: side === 0
					? "Team 1 (winner)"
					: "Team 2 (loser)";
		console.log(`### ${teamLabel}`);
		const analyses = [0, 1, 2, 3].map((slot) =>
			analyzeSlot(sorted, side, slot as 0 | 1 | 2 | 3),
		);

		const sbDeaths = analyses.map(
			(a) => match.teams[side].players[a.slot]?.d ?? null,
		);
		const tlDeaths = analyses.map((a) => a.deadSpans.length);
		const deathsMultisetMatch =
			sbDeaths.every((d) => d !== null) &&
			multisetEquals(sbDeaths as number[], tlDeaths);

		for (const analysis of analyses) {
			printSlot(index, builtMatch, analysis, deathsMultisetMatch);
		}

		if (
			deathsMultisetMatch &&
			sbDeaths.some((d, slot) => d !== tlDeaths[slot])
		) {
			console.log(
				"  note: death counts match as a set but not per row — likely a slot→row assignment artifact (CSV carries only top-1 strip-weapon candidates), not a detection error",
			);
		}
	}

	printPovCrossCheck(match, sources);
	console.log("");
}

function printSlot(
	matchIndex: number,
	builtMatch: BuiltMatch<DetectedEvent>,
	analysis: SlotAnalysis,
	deathsMultisetMatch: boolean,
): void {
	const { match, sources } = builtMatch;
	const { side, slot } = analysis;
	const player = match.teams[side].players[slot];
	const label = playerLabelOf(match, side, slot);

	const sbD = player?.d ?? null;
	const sbS = player?.s ?? null;
	const tlD = analysis.deadSpans.length;
	const tlUses = analysis.specialUses;

	const deathVerdict = verdict(sbD, tlD);
	const specialNotes = [
		analysis.diedWithSpecial > 0
			? `${analysis.diedWithSpecial} died holding special (legit non-use)`
			: null,
		analysis.heldAtEnd ? "held at match end (legit non-use)" : null,
		analysis.unknownSpecialEnds > 0
			? `${analysis.unknownSpecialEnds} special end(s) lost in observation gaps`
			: null,
	].filter((note) => note !== null);
	const specialVerdict = verdict(sbS, tlUses);

	console.log(
		`row${slot} ${label} — deaths sb=${sbD ?? "?"} tl=${tlD} ${deathVerdict.text} · specials sb=${sbS ?? "?"} used tl=${tlUses} (spans ${analysis.specialSpans.length}) ${specialVerdict.text}${specialNotes.length > 0 ? ` [${specialNotes.join("; ")}]` : ""}`,
	);

	const deadSuspicious = analysis.deadSpans.some(
		(span) => deadSpanSuspicions(span).length > 0,
	);
	const showDetail =
		showAllSpans ||
		deathVerdict.mismatch !== 0 ||
		specialVerdict.mismatch !== 0 ||
		deadSuspicious;
	if (showDetail) {
		if (analysis.deadSpans.length > 0) {
			console.log(
				`    dead spans: ${analysis.deadSpans.map((span) => spanText(span, deadSpanSuspicions(span))).join(" | ")}`,
			);
		}
		if (analysis.specialSpans.length > 0) {
			console.log(
				`    special spans: ${analysis.specialSpans.map((span) => spanText(span, specialSpanSuspicions(span))).join(" | ")}`,
			);
		}
	}

	collectCandidates(
		matchIndex,
		match,
		sources,
		analysis,
		sbD,
		sbS,
		deathsMultisetMatch,
	);
}

function verdict(
	sb: number | null,
	tl: number,
): { text: string; mismatch: number } {
	if (sb === null) return { text: "(scoreboard unread)", mismatch: 0 };
	const delta = tl - sb;
	if (delta === 0) return { text: "✓", mismatch: 0 };
	return {
		text:
			delta > 0
				? `✗ +${delta} EXTRA on timeline`
				: `✗ ${delta} MISSING on timeline`,
		mismatch: delta,
	};
}

function multisetEquals(a: readonly number[], b: readonly number[]): boolean {
	const as = a.toSorted((x, y) => x - y);
	const bs = b.toSorted((x, y) => x - y);
	return as.length === bs.length && as.every((v, i) => v === bs[i]);
}

function collectCandidates(
	matchIndex: number,
	match: ScannerMatch,
	sources: readonly DetectedEvent[],
	analysis: SlotAnalysis,
	sbD: number | null,
	sbS: number | null,
	deathsMultisetMatch: boolean,
): void {
	const { side, slot } = analysis;
	const label = `match ${matchIndex + 1} team ${side + 1} row${slot} (${playerLabelOf(match, side, slot)})`;
	const deadExcess = sbD !== null && analysis.deadSpans.length > sbD;
	const specialExcess = sbS !== null && analysis.specialUses > sbS;

	for (const span of analysis.deadSpans) {
		const suspicions = deadSpanSuspicions(span);
		if (suspicions.length === 0 && !deadExcess) continue;
		let score = 0;
		if (span.maxPossibleSeconds < MIN_DEAD_SECONDS) score += 4;
		if (span.confirmingReads.length === 1) score += 1;
		if (deadExcess) score += deathsMultisetMatch ? 1 : 3;
		if (score === 0) continue;
		const confirmed = span.confirmingReads.at(-1)! - span.confirmingReads[0]!;
		candidates.push({
			score: score + 1 / (1 + confirmed),
			t: span.start,
			matchIndex,
			description: `${label} — DEAD span ${Math.round((span.end - span.start) * 10) / 10}s over ${span.confirmingReads.length} read(s)${suspicions.length > 0 ? ` (${suspicions.join(", ")})` : ""}${deadExcess ? ` · row has +${analysis.deadSpans.length - (sbD ?? 0)} extra death(s) vs scoreboard` : ""}`,
			reads: readsInWindow(sources, span.start, span.end),
		});
	}

	if (specialExcess) {
		const shortestFirst = analysis.specialSpans.toSorted(
			(a, b) => a.confirmingReads.length - b.confirmingReads.length,
		);
		for (const span of shortestFirst.slice(
			0,
			analysis.specialUses - (sbS ?? 0),
		)) {
			const duration = span.end - span.start;
			candidates.push({
				score: 2 + 1 / (1 + span.confirmingReads.length),
				t: span.start,
				matchIndex,
				description: `${label} — SPECIAL span ${Math.round(duration * 10) / 10}s over ${span.confirmingReads.length} read(s), row has +${analysis.specialUses - (sbS ?? 0)} extra special use(s) vs scoreboard`,
				reads: readsInWindow(sources, span.start, span.end),
			});
		}
	}

	const deadMissing = sbD !== null && analysis.deadSpans.length < sbD;
	const specialMissing = sbS !== null && analysis.specialUses < sbS;
	if (deadMissing || specialMissing) {
		const missing = [
			deadMissing ? `${sbD - analysis.deadSpans.length} death(s)` : null,
			specialMissing ? `${sbS - analysis.specialUses} special use(s)` : null,
		].filter((part) => part !== null);
		candidates.push({
			score: 1.5,
			t: match.startsAt ?? 0,
			matchIndex,
			description: `${label} — timeline MISSING ${missing.join(" and ")}: either lost in unobserved gaps (see match coverage) or the detector never flagged the state — scan this row's footage`,
			reads: [],
		});
	}
}

function printPovCrossCheck(
	match: ScannerMatch,
	sources: readonly DetectedEvent[],
): void {
	if (match.pov === null) return;
	const overlayDeaths = sources.filter(
		(event) => event.type === DEATH_EVENT_TYPE,
	).length;
	const povRow = match.teams[match.pov.team].players[match.pov.index];
	if (povRow?.d == null) return;
	const agrees = overlayDeaths === povRow.d ? "✓" : "✗ disagrees";
	console.log(
		`pov cross-check: ${overlayDeaths} respawn-overlay death event(s) vs scoreboard d=${povRow.d} for ${povRow.name ?? "?"} ${agrees} (independent of the icon-strip pipeline)`,
	);
}

function printCandidates(): void {
	console.log("## Fixture candidates (most suspect first)");
	if (candidates.length === 0) {
		console.log("none — timeline agrees with every scoreboard count");
		console.log("");
		return;
	}
	const ranked = candidates.toSorted((a, b) => b.score - a.score);
	for (const [i, candidate] of ranked.entries()) {
		console.log(`${i + 1}. ${ts(candidate.t)} · ${candidate.description}`);
		if (candidate.reads.length > 0) {
			console.log(
				`   reads to inspect: ${candidate.reads
					.slice(0, 8)
					.map((t) => `t=${t}`)
					.join(
						", ",
					)}${candidate.reads.length > 8 ? ` (+${candidate.reads.length - 8} more)` : ""}`,
			);
		}
	}
	console.log("");
}

function printGuidance(): void {
	console.log("## How to turn a candidate into a fixture");
	console.log(
		"1. Seek the VoD to the candidate's read timestamps (t = seconds into the footage; hh:mm:ss given alongside).",
	);
	console.log(
		"2. In the scanner UI, analyze that frame and use “Save fixture” — the misread frame lands byte-exact with a prefilled expected.json.",
	);
	console.log(
		"3. Hand-correct expected.json (icon-strip states go under tests/fixtures/player-status/, minimap card states under tests/fixtures/minimap/), then run pnpm test:scanner.",
	);
	console.log(
		"Legend: a DEAD span shorter than 3.5s cannot be a real splat (min respawn); single-read spans are one frame's misread away from vanishing; EXTRA counts point at phantom bands, MISSING counts at undetected states or coverage gaps.",
	);
}
