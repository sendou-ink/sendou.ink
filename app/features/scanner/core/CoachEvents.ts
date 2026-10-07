// xxx: maybe retake failed?

/**
 * Coach events: the moments of a scanned match worth reviewing, always from the
 * POV player's team's side (an enemy push is the POV team's PUSH_DEFENSE, an
 * enemy death streak is nothing). Config driven: `DEFINITIONS`
 * names each event type and the rule it is detected by; the interpreter below
 * analyzes the match once and runs every definition whose modes apply. A new
 * type is a new row, a new kind of moment a new rule kind.
 *
 * Every event is a window into the footage (`start`..`end`, seconds into the
 * video/stream) cut to show the lead-up: an objective taken counts from the
 * first splat on the losing side within `KILL_LEAD_WINDOW_S` before it, less
 * `LEAD_BUFFER_S`.
 */
import type { ModeShort } from "~/modules/in-game-lists/types";
import type {
	ScannerMatch,
	ScannerMatchObjectiveSample,
	ScannerMatchPlayerStatusSample,
} from "./scanner-match";

export const DEFINITIONS = [
	{
		type: "OPENING_WON",
		label: "Opening won",
		modes: ["SZ", "TC", "RM", "CB"],
		rule: { kind: "opening", outcome: "won" },
	},
	{
		type: "OPENING_LOST",
		label: "Opening lost",
		modes: ["SZ", "TC", "RM", "CB"],
		rule: { kind: "opening", outcome: "lost" },
	},
	{
		type: "PUSH_OFFENSE",
		label: "Push",
		modes: ["TC", "RM", "CB"],
		rule: { kind: "push", side: "pov" },
	},
	{
		type: "PUSH_DEFENSE",
		label: "Enemy push",
		modes: ["TC", "RM", "CB"],
		rule: { kind: "push", side: "enemy" },
	},
	{
		type: "PUSH_OFFENSE_GAME_WINNING",
		label: "Game-winning push",
		modes: ["TC", "RM"],
		rule: { kind: "push", side: "pov", gameWinning: true },
	},
	{
		type: "PUSH_DEFENSE_GAME_WINNING",
		label: "Enemy game-winning push",
		modes: ["TC", "RM"],
		rule: { kind: "push", side: "enemy", gameWinning: true },
	},
	{
		type: "RETAKE",
		label: "Retake",
		modes: ["SZ"],
		rule: { kind: "retake" },
	},
	{
		type: "HOLD",
		label: "Hold",
		modes: ["SZ"],
		rule: { kind: "hold", best: false },
	},
	{
		type: "BEST_HOLD",
		label: "Best hold",
		modes: ["SZ"],
		rule: { kind: "hold", best: true },
	},
	{
		type: "SPECIAL_STACK_2",
		label: "2 specials stacked",
		rule: { kind: "specialStack", minSpecials: 2 },
	},
	{
		type: "SPECIAL_STACK_3",
		label: "3 specials stacked",
		rule: { kind: "specialStack", minSpecials: 3 },
	},
	{
		type: "DIED_WITH_SPECIAL",
		label: "Died with special",
		rule: { kind: "diedWithSpecial" },
	},
	{
		type: "DEATH_STREAK",
		label: "Death streak",
		rule: { kind: "deathStreak", minDeaths: 3 },
	},
] as const satisfies readonly CoachEventDefinition[];

export type CoachEventType = (typeof DEFINITIONS)[number]["type"];

/** a team holds the objective this long (TC/RM) … */
const PUSH_MIN_CONTROL_S = 5;
/** … and moves it this far toward the enemy goal (track units, = count points) for a push */
const PUSH_MIN_PROGRESS = 20;
/** zone control lasting this long is a hold */
const HOLD_MIN_S = 10;
/** splats on the losing side this long before the objective was taken belong to the push */
const KILL_LEAD_WINDOW_S = 20;
/** footage kept before a window's first splat (or the take, without one) */
const LEAD_BUFFER_S = 5;
/** footage kept before a death, to see what led to it */
const DEATH_LEAD_S = 10;
const DEATH_TAIL_S = 2;
/** specials used at most this far apart stack */
const SPECIAL_STACK_MAX_GAP_S = 5;
const SPECIAL_STACK_TAIL_S = 5;
/** Clam Blitz's opening is decided by the splats in its first seconds */
const CB_OPENING_S = 45;
/** the opening needs footage from at most this far into the game */
const OPENING_MAX_MISSED_S = 20;
/** ranked modes run a 5:00 clock */
const GAME_LENGTH_S = 300;
/** consecutive samples further apart than this leave an unobserved gap */
const MAX_SAMPLE_GAP_S = 15;
/** a team's control interrupted this briefly with no one else holding is one control */
const CONTROL_MERGE_GAP_S = 3;
/** a splatted read this soon after a special stopped showing means it was lost, not used */
const SPECIAL_DEATH_LAG_S = 1.5;
/** POV death reads this close together are one death (a minimap opened while splatted re-reads it) */
const DEATH_MERGE_GAP_S = 6;

type Side = "pov" | "enemy";

type CoachRule =
	/** who first gets a push (TC/RM) or a hold (SZ); in CB who splats more in the first `CB_OPENING_S` */
	| { kind: "opening"; outcome: "won" | "lost" }
	/** control lasting `PUSH_MIN_CONTROL_S` and moving `PUSH_MIN_PROGRESS` (TC/RM) or any open basket (CB); `gameWinning` keeps only the push the game was won off */
	| { kind: "push"; side: Side; gameWinning?: boolean }
	/** the POV team's zone control lasting `HOLD_MIN_S`; `best` keeps the longest */
	| { kind: "hold"; best: boolean }
	/** the POV team taking the zone back from the enemy into a hold, cut like a push */
	| { kind: "retake" }
	/** at least `minSpecials` POV team specials, each within `SPECIAL_STACK_MAX_GAP_S` of the previous */
	| { kind: "specialStack"; minSpecials: number }
	/** the POV player splatted while holding their special */
	| { kind: "diedWithSpecial" }
	/** at least `minDeaths` POV player deaths with no POV kill between them */
	| { kind: "deathStreak"; minDeaths: number };

interface CoachEventDefinition {
	type: string;
	label: string;
	/** modes the event exists in; omitted = every mode (Turf War and unknown included) */
	modes?: readonly ModeShort[];
	rule: CoachRule;
}

export interface CoachEvent {
	type: CoachEventType;
	/** seconds into the video/stream the window starts at, lead-up included */
	start: number;
	/** seconds into the video/stream the window ends at */
	end: number;
	/** the match timer at `start`; null when the clock was never read */
	time: number | null;
}

/**
 * The match's coach events, ordered by `start`. `povDeaths` are the POV
 * player's death reads (seconds into the video/stream, e.g. `povDeathTimes`
 * of the match's sources); reads of one death may repeat. A match whose POV
 * team is unknown (a cast, a results screen without the POV seat) has none.
 */
export function ofMatch(
	match: ScannerMatch,
	povDeaths: readonly number[],
): CoachEvent[] {
	const analysis = analyze(match, povDeaths);
	if (!analysis) return [];

	return DEFINITIONS.filter(
		(definition: CoachEventDefinition) =>
			!definition.modes ||
			(analysis.mode !== null && definition.modes.includes(analysis.mode)),
	)
		.flatMap((definition) =>
			mergedOverlapping(detectMoments(definition.rule, analysis)).map(
				(moment): CoachEvent => ({
					type: definition.type,
					start: Math.max(0, moment.start),
					end: moment.end,
					time: clockAt(analysis, Math.max(0, moment.start)),
				}),
			),
		)
		.sort((a, b) => a.start - b.start);
}

/** The definition's display label. */
export function label(type: CoachEventType): string {
	return DEFINITIONS.find((definition) => definition.type === type)!.label;
}

type Team = 0 | 1;

interface Moment {
	start: number;
	end: number;
}

interface ControlRun {
	team: Team;
	/** seconds into the video/stream the control was first read */
	start: number;
	/** when the control was last confirmed, or the read showing it gone */
	end: number;
	samples: ScannerMatchObjectiveSample[];
}

interface Analysis {
	mode: ModeShort | null;
	povTeam: Team;
	enemyTeam: Team;
	/** the POV player's slot in the status samples; null without a POV seat */
	povSlot: number | null;
	winner: Team | null;
	objective: ScannerMatchObjectiveSample[];
	statuses: ScannerMatchPlayerStatusSample[];
	controlRuns: ControlRun[];
	/** each team's splat times off the icon strip, `teams` order */
	splats: [number[], number[]];
	/** the POV player's kills; null when the kill feed was never read */
	povKills: number[] | null;
	/** the POV player's deaths, one per death */
	povDeaths: number[];
	/** seconds into the video/stream the game clock starts at; null when never read */
	gameStartT: number | null;
}

function detectMoments(rule: CoachRule, analysis: Analysis): Moment[] {
	switch (rule.kind) {
		case "opening":
			return openingMoments(rule.outcome, analysis);
		case "push":
			return pushMoments(rule.side, rule.gameWinning ?? false, analysis);
		case "hold":
			return holdMoments(rule.best, analysis);
		case "retake":
			return retakeMoments(analysis);
		case "specialStack":
			return specialStackMoments(rule.minSpecials, analysis);
		case "diedWithSpecial":
			return diedWithSpecialMoments(analysis);
		case "deathStreak":
			return deathStreakMoments(rule.minDeaths, analysis);
	}
}

function analyze(
	match: ScannerMatch,
	povDeaths: readonly number[],
): Analysis | null {
	const povTeam = povTeamOf(match);
	if (povTeam === null) return null;

	const objective = (match.objective?.samples ?? []).toSorted(
		(a, b) => a.t - b.t,
	);
	const statuses = (match.playerStatus?.samples ?? []).toSorted(
		(a, b) => a.t - b.t,
	);
	const povSlot = match.pov?.index ?? null;
	const povDeadReads =
		povSlot === null
			? []
			: risingEdges(statuses, (sample) => sample.dead[povTeam][povSlot]!);

	return {
		mode: match.mode ?? match.objective?.mode ?? null,
		povTeam,
		enemyTeam: otherTeam(povTeam),
		povSlot,
		winner: match.winner ?? winnerByCount(objective),
		objective,
		statuses,
		controlRuns: controlRuns(objective),
		splats: [teamSplats(statuses, 0), teamSplats(statuses, 1)],
		povKills: match.kills?.map((kill) => kill.t).sort((a, b) => a - b) ?? null,
		povDeaths: mergedDeaths([...povDeaths, ...povDeadReads]),
		gameStartT: projectedGameStartT(objective, statuses),
	};
}

/**
 * `teams[pov.team]` when a results screen named the seat; otherwise POV footage
 * keeps the POV side as `teams[0]` (minimap own side, the left plate) until a
 * results screen reorders `teams` winner-first — without the seat then, and on
 * a cast, there is no POV team.
 */
function povTeamOf(match: ScannerMatch): Team | null {
	if (match.pov) return match.pov.team;
	if (match.cast || match.winner !== null) return null;
	return 0;
}

function openingMoments(outcome: "won" | "lost", analysis: Analysis): Moment[] {
	const { gameStartT, povTeam } = analysis;
	if (gameStartT === null || !coversOpening(analysis, gameStartT)) return [];

	if (analysis.mode === "CB") {
		const opening = { start: gameStartT, end: gameStartT + CB_OPENING_S };
		const splatsIn = (team: Team) =>
			analysis.splats[team].filter(
				(t) => t >= opening.start && t <= opening.end,
			).length;
		const povTeamSplats = splatsIn(analysis.enemyTeam);
		const enemySplats = splatsIn(povTeam);
		if (povTeamSplats === enemySplats) return [];
		const won = povTeamSplats > enemySplats;
		return won === (outcome === "won") ? [opening] : [];
	}

	const first = analysis.controlRuns.find((run) =>
		analysis.mode === "SZ" ? isHold(run) : isPush(run, analysis.mode),
	);
	if (!first) return [];
	const won = first.team === povTeam;
	if (won !== (outcome === "won")) return [];
	return [
		{
			start: gameStartT,
			end:
				first.start +
				(analysis.mode === "SZ" ? HOLD_MIN_S : PUSH_MIN_CONTROL_S),
		},
	];
}

function pushMoments(
	side: Side,
	gameWinning: boolean,
	analysis: Analysis,
): Moment[] {
	const team = side === "pov" ? analysis.povTeam : analysis.enemyTeam;
	const pushes = analysis.controlRuns.filter(
		(run) => run.team === team && isPush(run, analysis.mode),
	);
	const kept = gameWinning
		? pushes.filter((run) => run === gameWinningPush(pushes, team, analysis))
		: pushes;
	return kept.map((run) => takeMoment(run, analysis));
}

/**
 * The push the winner's count first went below the loser's final count in:
 * from then on the loser never caught up, so the game was won off it even
 * when a later push went further.
 */
function gameWinningPush(
	pushes: readonly ControlRun[],
	team: Team,
	analysis: Analysis,
): ControlRun | undefined {
	if (analysis.winner !== team) return undefined;
	const loserFinal = lowestCount(analysis.objective, otherTeam(team));
	if (loserFinal === null) return undefined;
	const decided = analysis.objective.find(
		(sample) => sample.score[team] !== null && sample.score[team] < loserFinal,
	);
	if (!decided) return undefined;
	return pushes.find((run) => run.start <= decided.t && decided.t <= run.end);
}

function holdMoments(best: boolean, analysis: Analysis): Moment[] {
	const holds = analysis.controlRuns.filter(
		(run) => run.team === analysis.povTeam && isHold(run),
	);
	const kept = best
		? holds.toSorted((a, b) => b.end - b.start - (a.end - a.start)).slice(0, 1)
		: holds;
	return kept.map((run) => ({ start: run.start, end: run.end }));
}

function retakeMoments(analysis: Analysis): Moment[] {
	return analysis.controlRuns.flatMap((run, index) => {
		const previous = analysis.controlRuns[index - 1];
		if (
			run.team !== analysis.povTeam ||
			!isHold(run) ||
			previous?.team !== analysis.enemyTeam
		) {
			return [];
		}
		return [
			{ start: takeMoment(run, analysis).start, end: run.start + HOLD_MIN_S },
		];
	});
}

function specialStackMoments(
	minSpecials: number,
	analysis: Analysis,
): Moment[] {
	const uses = [0, 1, 2, 3]
		.flatMap((slot) => specialUses(analysis, slot))
		.sort((a, b) => a - b);
	return clusters(uses, SPECIAL_STACK_MAX_GAP_S)
		.filter((cluster) => cluster.length >= minSpecials)
		.map((cluster) => ({
			start: cluster[0]! - LEAD_BUFFER_S,
			end: cluster.at(-1)! + SPECIAL_STACK_TAIL_S,
		}));
}

function diedWithSpecialMoments(analysis: Analysis): Moment[] {
	const { povSlot, povTeam, statuses } = analysis;
	if (povSlot === null) return [];
	const moments: Moment[] = [];
	for (const [index, sample] of statuses.entries()) {
		const previous = statuses[index - 1];
		if (
			!previous ||
			sample.t - previous.t > MAX_SAMPLE_GAP_S ||
			!previous.special[povTeam][povSlot] ||
			previous.dead[povTeam][povSlot]
		) {
			continue;
		}
		const diedAt = sample.dead[povTeam][povSlot]
			? sample.t
			: sample.special[povTeam][povSlot]
				? null
				: deadReadSoonAfter(statuses, index, povTeam, povSlot);
		if (diedAt !== null) {
			moments.push({
				start: diedAt - DEATH_LEAD_S,
				end: diedAt + DEATH_TAIL_S,
			});
		}
	}
	return moments;
}

function deathStreakMoments(minDeaths: number, analysis: Analysis): Moment[] {
	const { povKills, povDeaths } = analysis;
	if (povKills === null) return [];

	const streaks: number[][] = [];
	let streak: number[] = [];
	for (const death of povDeaths) {
		const last = streak.at(-1);
		// a kill on a death's second (a trade) counts before that death
		if (
			last !== undefined &&
			povKills.some((kill) => kill > last && kill <= death)
		) {
			streaks.push(streak);
			streak = [];
		}
		streak.push(death);
	}
	streaks.push(streak);

	return streaks
		.filter((deaths) => deaths.length >= minDeaths)
		.map((deaths) => ({
			start: deaths[0]! - DEATH_LEAD_S,
			end: deaths.at(-1)! + DEATH_TAIL_S,
		}));
}

/** Windows of one type that overlap (a push resumed right after a contest) are one moment to review. */
function mergedOverlapping(moments: readonly Moment[]): Moment[] {
	const merged: Moment[] = [];
	for (const moment of moments.toSorted((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && moment.start <= last.end)
			last.end = Math.max(last.end, moment.end);
		else merged.push({ ...moment });
	}
	return merged;
}

/** From the first splat on the losing side shortly before the take (less a buffer) to the control's end. */
function takeMoment(run: ControlRun, analysis: Analysis): Moment {
	const victims = otherTeam(run.team);
	const splats = [
		...analysis.splats[victims],
		...(run.team === analysis.povTeam ? (analysis.povKills ?? []) : []),
	];
	const firstSplat = Math.min(
		run.start,
		...splats.filter(
			(t) => t >= run.start - KILL_LEAD_WINDOW_S && t <= run.start,
		),
	);
	return { start: firstSplat - LEAD_BUFFER_S, end: run.end };
}

function isPush(run: ControlRun, mode: ModeShort | null): boolean {
	if (mode === "CB") return true;
	return (
		run.end - run.start >= PUSH_MIN_CONTROL_S &&
		progressOf(run) >= PUSH_MIN_PROGRESS
	);
}

function isHold(run: ControlRun): boolean {
	return run.end - run.start >= HOLD_MIN_S;
}

/**
 * How far the run moved the objective toward the enemy goal: along the track
 * when the icon was read, else by the drop in the team's count (which only
 * falls past the team's furthest point so far).
 */
function progressOf(run: ControlRun): number {
	const forward = run.samples.flatMap((sample) =>
		sample.position == null
			? []
			: [run.team === 0 ? sample.position : -sample.position],
	);
	const counts = run.samples.flatMap((sample) =>
		sample.score[run.team] === null ? [] : [sample.score[run.team]!],
	);
	return Math.max(
		forward.length > 0 ? Math.max(...forward) - forward[0]! : 0,
		counts.length > 0 ? counts[0]! - Math.min(...counts) : 0,
	);
}

/**
 * Each team's stretches of control, chronological. A run ends at the read
 * showing its control gone, or at its last read before an unobserved gap; a
 * brief loss nobody else took (a contested zone flickering neutral) doesn't
 * end it. A run's samples include the read that ended it, which can still
 * show the count the run reached.
 */
function controlRuns(
	objective: readonly ScannerMatchObjectiveSample[],
): ControlRun[] {
	const runs: ControlRun[] = [];
	let open: ControlRun | null = null;
	const close = () => {
		if (!open) return;
		const last = runs.at(-1);
		if (
			last &&
			last.team === open.team &&
			open.start - last.end <= CONTROL_MERGE_GAP_S
		) {
			last.end = open.end;
			last.samples.push(...open.samples);
		} else {
			runs.push(open);
		}
		open = null;
	};

	for (const sample of objective) {
		if (open && sample.t - open.end > MAX_SAMPLE_GAP_S) close();
		if (open && sample.control !== open.team) {
			open.end = sample.t;
			open.samples.push(sample);
			close();
		}
		if (sample.control === null) continue;
		if (open) {
			open.end = sample.t;
			open.samples.push(sample);
		} else {
			open = {
				team: sample.control,
				start: sample.t,
				end: sample.t,
				samples: [sample],
			};
		}
	}
	close();
	return runs;
}

/** Times a special stopped showing on a POV team slot with no splat to explain it. */
function specialUses(analysis: Analysis, slot: number): number[] {
	const { povTeam, statuses } = analysis;
	return statuses.flatMap((sample, index) => {
		const previous = statuses[index - 1];
		if (
			!previous ||
			sample.t - previous.t > MAX_SAMPLE_GAP_S ||
			!previous.special[povTeam][slot] ||
			sample.special[povTeam][slot] ||
			sample.dead[povTeam][slot] ||
			deadReadSoonAfter(statuses, index, povTeam, slot) !== null
		) {
			return [];
		}
		return [sample.t];
	});
}

function deadReadSoonAfter(
	statuses: readonly ScannerMatchPlayerStatusSample[],
	index: number,
	team: Team,
	slot: number,
): number | null {
	const from = statuses[index]!.t;
	for (const sample of statuses.slice(index + 1)) {
		if (sample.t - from > SPECIAL_DEATH_LAG_S) return null;
		if (sample.dead[team][slot]) return sample.t;
	}
	return null;
}

function teamSplats(
	statuses: readonly ScannerMatchPlayerStatusSample[],
	team: Team,
): number[] {
	return [0, 1, 2, 3]
		.flatMap((slot) =>
			risingEdges(statuses, (sample) => sample.dead[team][slot]!),
		)
		.sort((a, b) => a - b);
}

/** Times the flag turned on; the first read counts when it already shows on. */
function risingEdges(
	samples: readonly ScannerMatchPlayerStatusSample[],
	flagOf: (sample: ScannerMatchPlayerStatusSample) => boolean,
): number[] {
	return samples.flatMap((sample, index) => {
		const previous = samples[index - 1];
		return flagOf(sample) && (!previous || !flagOf(previous)) ? [sample.t] : [];
	});
}

function mergedDeaths(reads: readonly number[]): number[] {
	return clusters(
		reads.toSorted((a, b) => a - b),
		DEATH_MERGE_GAP_S,
	).map((cluster) => cluster[0]!);
}

/** Sorted values grouped wherever consecutive ones are at most `maxGap` apart. */
function clusters(sorted: readonly number[], maxGap: number): number[][] {
	const groups: number[][] = [];
	for (const value of sorted) {
		const group = groups.at(-1);
		if (group && value - group.at(-1)! <= maxGap) group.push(value);
		else groups.push([value]);
	}
	return groups;
}

function lowestCount(
	objective: readonly ScannerMatchObjectiveSample[],
	team: Team,
): number | null {
	const counts = objective.flatMap((sample) =>
		sample.score[team] === null ? [] : [sample.score[team]!],
	);
	return counts.length > 0 ? Math.min(...counts) : null;
}

/** Without a results screen the side whose count went further down won (a tie is unknown). */
function winnerByCount(
	objective: readonly ScannerMatchObjectiveSample[],
): Team | null {
	const counts = [lowestCount(objective, 0), lowestCount(objective, 1)];
	if (counts[0] === null || counts[1] === null || counts[0] === counts[1]) {
		return null;
	}
	return counts[0] < counts[1] ? 0 : 1;
}

/** The median of every timed read's projected clock start: one misread clock can't move it. */
function projectedGameStartT(
	objective: readonly ScannerMatchObjectiveSample[],
	statuses: readonly ScannerMatchPlayerStatusSample[],
): number | null {
	const starts = [...objective, ...statuses]
		.flatMap((sample) =>
			sample.time === null || sample.time <= 0 || sample.time > GAME_LENGTH_S
				? []
				: [sample.t + sample.time - GAME_LENGTH_S],
		)
		.sort((a, b) => a - b);
	if (starts.length === 0) return null;
	return starts[Math.floor(starts.length / 2)]!;
}

function coversOpening(analysis: Analysis, gameStartT: number): boolean {
	const firstRead = Math.min(
		analysis.objective[0]?.t ?? Number.POSITIVE_INFINITY,
		analysis.statuses[0]?.t ?? Number.POSITIVE_INFINITY,
	);
	return firstRead - gameStartT <= OPENING_MAX_MISSED_S;
}

function clockAt(analysis: Analysis, t: number): number | null {
	if (analysis.gameStartT === null) return null;
	return Math.min(
		GAME_LENGTH_S,
		Math.max(0, Math.round(analysis.gameStartT + GAME_LENGTH_S - t)),
	);
}

function otherTeam(team: Team): Team {
	return team === 0 ? 1 : 0;
}
