import { seededRandom } from "~/utils/random";
import type { Standing } from "../Bracket";
import * as Engine from "../engine";
import type { BracketData, MatchData } from "../engine/types";
import type { Tournament } from "../Tournament";
import * as BracketInvariants from "./BracketInvariants";
import * as BracketReplay from "./BracketReplay";
import * as BracketSimulator from "./BracketSimulator";
import { progressions } from "./test-utils";

/** An invariant that broke, `class` being what a shrunk sequence has to keep breaking. */
interface Violation {
	class: string;
	detail: string;
}

interface Failure {
	seed: string;
	scenario: BracketSimulator.Scenario;
	violation: Violation;
	/** The shrunk sequence, as the steps resolved. */
	steps: string[];
}

type RandomSource = ReturnType<typeof seededRandom>;

const STEP_WEIGHTS: Array<[BracketSimulator.StepKind, number]> = [
	["REPORT_GAME", 60],
	["START_BRACKET", 8],
	["ADVANCE_SWISS", 8],
	["REOPEN", 8],
	["UNDO_GAME", 6],
	["END_SET", 5],
	["DROP_TEAM", 5],
];

/** Group sizes up to this get their swiss pairings checked against every possible pairing. */
const MAX_TEAMS_FOR_PAIRING_ORACLE = 10;

/**
 * Plays a random tournament of the seed, checking every invariant after every step. A failing
 * sequence is shrunk before it is returned.
 */
export function run(seed: string, stepCount: number): Failure | null {
	const random = seededRandom(seed);
	const scenario = randomScenario(random);
	const choices = Array.from({ length: stepCount }, () => randomChoice(random));

	const failed = play(seed, scenario, choices);
	if (!failed) return null;

	const shrunk = shrink(seed, scenario, choices, failed.violation.class);
	const replayed = play(seed, scenario, shrunk);

	return {
		seed,
		scenario,
		violation: replayed?.violation ?? failed.violation,
		steps: replayed?.steps ?? failed.steps,
	};
}

/** Readable report of a failure: seed, scenario and the minimal steps. */
export function describeFailure(failure: Failure) {
	return [
		`${failure.violation.class}: ${failure.violation.detail}`,
		`seed: ${failure.seed}`,
		`scenario: ${failure.scenario.label}, ${failure.scenario.teamCount} teams, sets ${failure.scenario.maps.map((maps) => `${maps.type} ${maps.count}`).join(" / ")}`,
		"steps:",
		...failure.steps.map((step, i) => `  ${i + 1}. ${step}`),
	].join("\n");
}

function play(
	seed: string,
	scenario: BracketSimulator.Scenario,
	choices: BracketSimulator.Choice[],
): { violation: Violation; steps: string[] } | null {
	// swiss pairing and double drop outs draw from Math.random
	const originalRandom = Math.random;
	const engineRandom = seededRandom(`${seed}-engine`);
	Math.random = () => engineRandom.random();

	try {
		let state = BracketSimulator.initialState(scenario);
		const steps: string[] = [];

		for (const choice of choices) {
			let next: ReturnType<typeof BracketSimulator.apply>;
			try {
				next = BracketSimulator.apply(state, choice);
			} catch (error) {
				return {
					violation: {
						class: `threw:${choice.kind}`,
						detail: String(error),
					},
					steps: [...steps, `${choice.kind} (threw)`],
				};
			}
			if (!next.applied) continue;

			steps.push(next.applied.description);

			let violation: Violation | null;
			try {
				violation = firstViolation(state, next.state, next.applied);
			} catch (error) {
				violation = { class: "threw:check", detail: String(error) };
			}
			if (violation) return { violation, steps };

			state = next.state;
		}

		return null;
	} finally {
		Math.random = originalRandom;
	}
}

/** Drops chunks of steps, halving the chunk size, for as long as the same class of violation remains. */
function shrink(
	seed: string,
	scenario: BracketSimulator.Scenario,
	choices: BracketSimulator.Choice[],
	violationClass: string,
) {
	let current = choices;
	const stillFails = (candidate: BracketSimulator.Choice[]) =>
		play(seed, scenario, candidate)?.violation.class === violationClass;

	for (
		let chunkSize = Math.ceil(current.length / 2);
		chunkSize >= 1;
		chunkSize = Math.floor(chunkSize / 2)
	) {
		let start = 0;
		while (start < current.length) {
			const candidate = [
				...current.slice(0, start),
				...current.slice(start + chunkSize),
			];
			if (stillFails(candidate)) {
				current = candidate;
			} else {
				start += chunkSize;
			}
		}
	}

	return current;
}

function firstViolation(
	before: BracketSimulator.State,
	after: BracketSimulator.State,
	applied: BracketSimulator.Applied,
): Violation | null {
	const tournamentBefore = BracketSimulator.tournamentOf(before);
	const tournament = BracketSimulator.tournamentOf(after);
	for (const stage of after.data.stage) {
		const data = BracketSimulator.stageData(after.data, stage.id);

		const broken = BracketInvariants.violations(data).find(
			(violation) =>
				// reopening a round robin match leaves the later rounds of its teams as they are
				stage.type !== "round_robin" ||
				violation.class !== "team-in-two-open-matches",
		);
		if (broken) {
			return {
				class: `invariant:${broken.class}`,
				detail: `stage ${stage.id} match ${broken.matchId}: ${broken.detail}`,
			};
		}

		const replay = BracketReplay.replayStage(data, {
			skipSwissPairings: true,
			roundRobinRoundsInAnyOrder: true,
		});
		const mismatch = replay.mismatches[0];
		if (mismatch) {
			return {
				class: `not-reachable-from-scratch:${mismatch.class}`,
				detail: `stage ${stage.id} match ${mismatch.matchId}: ${mismatch.detail}`,
			};
		}
	}

	return (
		inverseViolation(before, after, applied, tournament) ??
		lostResultViolation(before, after, applied) ??
		droppedTeamViolation(after, applied, tournament) ??
		standingsViolation(tournamentBefore, tournament, after, applied) ??
		swissPairingViolation(before, after, applied, tournament)
	);
}

/** Undoing (or reopening) right after a report gives back the state before it, and reporting again the state after it. */
function inverseViolation(
	before: BracketSimulator.State,
	after: BracketSimulator.State,
	applied: BracketSimulator.Applied,
	tournament: Tournament,
): Violation | null {
	if (applied.kind !== "REPORT_GAME" || applied.endedMatchIds.length > 0) {
		return null;
	}

	const matchId = applied.matchId!;
	const winnerTeamId = after.gamesByMatchId.get(matchId)!.at(-1)!;
	const match = after.data.match.find((candidate) => candidate.id === matchId)!;

	if (!match.winnerSide) {
		const undone = Engine.undoGameResult(after.data, {
			matchId,
			lastGameWinnerTeamId: winnerTeamId,
		}).data;
		const difference = firstDifference(before.data, undone);
		if (difference) {
			return { class: "undo-is-not-inverse-of-report", detail: difference };
		}

		const reportedAgain = Engine.reportGameResult(undone, {
			matchId,
			winnerTeamId,
		}).data;
		const againDifference = firstDifference(after.data, reportedAgain);

		return againDifference
			? { class: "report-after-undo-differs", detail: againDifference }
			: null;
	}

	if (!tournament.matchCanBeReopened(matchId)) return null;

	const reopened = Engine.reopenMatch(after.data, {
		matchId,
		lastGameWinnerTeamId: winnerTeamId,
	}).data;
	const difference = firstDifference(before.data, reopened);

	return difference
		? { class: "reopen-is-not-inverse-of-report", detail: difference }
		: null;
}

/** Taking a result back never touches the result of another match. */
function lostResultViolation(
	before: BracketSimulator.State,
	after: BracketSimulator.State,
	applied: BracketSimulator.Applied,
): Violation | null {
	if (applied.kind !== "REOPEN" && applied.kind !== "UNDO_GAME") return null;

	const afterById = new Map(after.data.match.map((match) => [match.id, match]));
	for (const match of before.data.match) {
		if (match.id === applied.matchId) continue;
		if (!match.opponent1?.id || !match.opponent2?.id) continue;
		if (!match.winnerSide && !Engine.isMatchStarted(match)) continue;

		const difference = matchDifference(match, afterById.get(match.id));
		if (difference) {
			return {
				class: "result-of-dependent-match-lost",
				detail: `${BracketSimulator.describeMatch(before.data, match)}: ${difference}`,
			};
		}
	}

	return null;
}

/** Once the matches of dropped teams were ended no dropped team is left with a match to play. */
function droppedTeamViolation(
	after: BracketSimulator.State,
	applied: BracketSimulator.Applied,
	tournament: Tournament,
): Violation | null {
	const droppedTeamIds = new Set(
		after.teams.filter((team) => team.droppedOut).map((team) => team.id),
	);
	if (droppedTeamIds.size === 0) return null;

	const endedDroppedTeamMatches =
		applied.kind === "DROP_TEAM" ||
		applied.kind === "END_SET" ||
		(applied.kind === "REPORT_GAME" &&
			Boolean(
				after.data.match.find((match) => match.id === applied.matchId)
					?.winnerSide,
			));
	if (endedDroppedTeamMatches) {
		const open = after.data.match.find(
			(match) =>
				!match.winnerSide &&
				match.opponent1?.id &&
				match.opponent2?.id &&
				(droppedTeamIds.has(match.opponent1.id) ||
					droppedTeamIds.has(match.opponent2.id)),
		);
		if (open) {
			return {
				class: "dropped-team-left-with-a-match",
				detail: BracketSimulator.describeMatch(after.data, open),
			};
		}
	}

	for (const bracket of tournament.brackets) {
		if (!bracket.preview) continue;

		const dropped = bracket.previewSeeding?.find((teamId) =>
			droppedTeamIds.has(teamId),
		);
		if (dropped) {
			return {
				class: "dropped-team-in-unstarted-bracket",
				detail: `team ${dropped} in the preview of bracket ${bracket.idx}`,
			};
		}
	}

	return null;
}

function standingsViolation(
	tournamentBefore: Tournament,
	tournament: Tournament,
	after: BracketSimulator.State,
	applied: BracketSimulator.Applied,
): Violation | null {
	for (const bracket of tournament.brackets) {
		if (bracket.preview) continue;

		const standings = bracket.standings;
		const describe = `bracket ${bracket.idx} (${bracket.type})`;

		const malformed = malformedStandings(
			standings,
			bracket.participantTournamentTeamIds,
		);
		if (malformed) {
			return {
				class: "standings-malformed",
				detail: `${describe}: ${malformed}`,
			};
		}

		const contradiction = standingsContradiction(bracket.data, standings);
		if (contradiction) {
			return {
				class: "standings-contradict-results",
				detail: `${describe}: ${contradiction}`,
			};
		}

		const bracketBefore = tournamentBefore.bracketByIdx(bracket.idx);
		if (!bracketBefore || bracketBefore.preview) continue;

		const order = (all: Standing[]) =>
			all
				.map((standing) => `${standing.team.id}@${standing.placement}`)
				.join(" ");

		if (applied.kind === "DROP_TEAM") {
			const advanced =
				bracketBefore.everyMatchOver &&
				tournament.teamPlaysFollowUpOf(bracket.idx, applied.teamId!);
			if (advanced && order(bracketBefore.standings) !== order(standings)) {
				return {
					class: "standings-changed-by-drop-after-advancing",
					detail: `${describe}: ${order(bracketBefore.standings)} -> ${order(standings)}`,
				};
			}
			continue;
		}

		if (bracket.id !== applied.stageId) {
			// a set ending anywhere ends the matches of dropped teams everywhere, also a reopened one
			const endedMatchHere = applied.endedMatchIds.some((matchId) =>
				bracket.data.match.some((candidate) => candidate.id === matchId),
			);
			if (
				!endedMatchHere &&
				order(bracketBefore.standings) !== order(standings)
			) {
				return {
					class: "standings-changed-by-step-in-another-bracket",
					detail: `${describe}: ${order(bracketBefore.standings)} -> ${order(standings)}`,
				};
			}
			continue;
		}

		if (
			bracket.type === "round_robin" ||
			bracket.type === "swiss" ||
			(applied.kind !== "REPORT_GAME" && applied.kind !== "END_SET")
		) {
			continue;
		}

		// elimination: teams whose matches did not change keep their order
		const match = after.data.match.find(
			(candidate) => candidate.id === applied.matchId,
		);
		const untouched = (standing: Standing) =>
			standing.team.id !== match?.opponent1?.id &&
			standing.team.id !== match?.opponent2?.id;
		const placementAfter = new Map(
			standings.map((standing) => [standing.team.id, standing.placement]),
		);
		const settledBefore = bracketBefore.standings.filter(
			(standing) => untouched(standing) && placementAfter.has(standing.team.id),
		);
		for (const one of settledBefore) {
			for (const two of settledBefore) {
				if (
					one.placement < two.placement &&
					placementAfter.get(one.team.id)! > placementAfter.get(two.team.id)!
				) {
					return {
						class: "standings-order-flipped-for-untouched-teams",
						detail: `${describe}: teams ${one.team.id} and ${two.team.id}`,
					};
				}
			}
		}
	}

	return null;
}

function malformedStandings(standings: Standing[], participantIds: number[]) {
	const seen = new Set<number>();
	let previousPlacement = 0;

	for (const standing of standings) {
		if (seen.has(standing.team.id)) return `team ${standing.team.id} twice`;
		seen.add(standing.team.id);

		if (!participantIds.includes(standing.team.id)) {
			return `team ${standing.team.id} is not a participant`;
		}
		if (!Number.isInteger(standing.placement) || standing.placement < 1) {
			return `placement ${standing.placement}`;
		}
		// groups are listed one after another, each starting over
		if (
			standing.groupId === undefined &&
			standing.placement < previousPlacement
		) {
			return `placement ${standing.placement} after ${previousPlacement}`;
		}
		previousPlacement = standing.placement;
	}

	return null;
}

function standingsContradiction(data: BracketData, standings: Standing[]) {
	const stage = data.stage[0];
	const placementOf = new Map(
		standings.map((standing) => [standing.team.id, standing]),
	);

	if (stage.type === "round_robin" || stage.type === "swiss") {
		for (const one of standings) {
			for (const two of standings) {
				if (one.groupId !== two.groupId) continue;
				if (one.team.droppedOut || two.team.droppedOut) continue;
				if (!one.stats || !two.stats) continue;

				if (
					one.stats.setWins > two.stats.setWins &&
					one.placement > two.placement
				) {
					return `team ${one.team.id} with ${one.stats.setWins} set wins is below team ${two.team.id} with ${two.stats.setWins}`;
				}
			}
		}

		return null;
	}

	const roundById = new Map(data.round.map((round) => [round.id, round]));
	for (const match of data.match) {
		if (!match.winnerSide || !match.opponent1?.id || !match.opponent2?.id) {
			continue;
		}

		const winner = placementOf.get(match[match.winnerSide]!.id!);
		const loser = placementOf.get(
			match[match.winnerSide === "opponent1" ? "opponent2" : "opponent1"]!.id!,
		);
		// a losers bracket team can still overtake the team that sent it there
		const isDecisive =
			stage.type === "single_elimination" ||
			roundById.get(match.roundId)?.section === "losers";
		if (!winner || !loser || !isDecisive) continue;
		if (winner.groupId !== loser.groupId) continue;

		if (winner.placement > loser.placement) {
			return `team ${winner.team.id} is placed ${winner.placement} below team ${loser.team.id} (${loser.placement}) it knocked out`;
		}
	}

	return null;
}

/** No rematch, repeat bye or bye above the lowest teams while another pairing avoids it, checked against every possible pairing. */
function swissPairingViolation(
	before: BracketSimulator.State,
	after: BracketSimulator.State,
	applied: BracketSimulator.Applied,
	tournament: Tournament,
): Violation | null {
	if (applied.kind !== "ADVANCE_SWISS") return null;

	const existingIds = new Set(before.data.match.map((match) => match.id));
	const paired = after.data.match.filter((match) => !existingIds.has(match.id));
	const groupId = paired[0]?.groupId;
	const earlier = before.data.match.filter(
		(match) => match.groupId === groupId,
	);

	const teamIds = paired.flatMap((match) =>
		[match.opponent1?.id, match.opponent2?.id].filter(
			(id): id is number => typeof id === "number",
		),
	);
	if (new Set(teamIds).size !== teamIds.length) {
		return { class: "swiss-team-paired-twice", detail: `group ${groupId}` };
	}
	const droppedOrDone = teamIds.find(
		(teamId) => tournament.teamById(teamId)?.droppedOut,
	);
	if (droppedOrDone) {
		return {
			class: "swiss-dropped-team-paired",
			detail: `team ${droppedOrDone}`,
		};
	}
	if (teamIds.length > MAX_TEAMS_FOR_PAIRING_ORACLE) return null;

	const record = BracketReplay.swissRecords(earlier);
	const meetings = new Map<string, number>();
	const hadBye = new Set<number>();
	for (const match of earlier) {
		if (match.opponent1?.id && match.opponent2?.id) {
			const key = pairKey(match.opponent1.id, match.opponent2.id);
			meetings.set(key, (meetings.get(key) ?? 0) + 1);
		} else if (match.opponent1?.id) {
			hadBye.add(match.opponent1.id);
		}
	}

	// [rematches, repeat byes, wins of the bye team], in the order the engine weighs them
	const cost = (pairs: Array<[number, number | null]>) => {
		const result = [0, 0, 0];
		for (const [one, two] of pairs) {
			if (two === null) {
				result[1] += hadBye.has(one) ? 1 : 0;
				result[2] += record.get(one)?.wins ?? 0;
			} else {
				result[0] += meetings.get(pairKey(one, two)) ?? 0;
			}
		}
		return result;
	};
	const isBetter = (a: number[], b: number[]) => {
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return a[i] < b[i];
		}
		return false;
	};

	let best: number[] | null = null;
	for (const pairing of everyPairing(teamIds)) {
		const pairingCost = cost(pairing);
		if (!best || isBetter(pairingCost, best)) best = pairingCost;
	}

	const actual = cost(
		paired.map((match) => [match.opponent1!.id!, match.opponent2?.id ?? null]),
	);
	if (best && isBetter(best, actual)) {
		return {
			class: "swiss-pairing-not-optimal",
			detail: `group ${groupId}: [rematches, repeat byes, bye team wins] is [${actual.join(", ")}], [${best.join(", ")}] is possible`,
		};
	}

	return null;
}

/** Every way to pair the teams, one of them left with a bye when the count is odd. */
function* everyPairing(
	teamIds: number[],
): Generator<Array<[number, number | null]>> {
	if (teamIds.length === 0) {
		yield [];
		return;
	}

	const [first, ...rest] = teamIds;
	if (teamIds.length % 2 === 1) {
		for (const [i, bye] of teamIds.entries()) {
			const others = teamIds.filter((_, idx) => idx !== i);
			for (const pairing of everyPairing(others)) {
				yield [...pairing, [bye, null]];
			}
		}
		return;
	}

	for (const [i, opponent] of rest.entries()) {
		const others = rest.filter((_, idx) => idx !== i);
		for (const pairing of everyPairing(others)) {
			yield [[first, opponent], ...pairing];
		}
	}
}

function firstDifference(expected: BracketData, actual: BracketData) {
	const actualById = new Map(actual.match.map((match) => [match.id, match]));

	for (const match of expected.match) {
		const difference = matchDifference(match, actualById.get(match.id));
		if (difference) {
			return `${BracketSimulator.describeMatch(expected, match)}: ${difference}`;
		}
	}

	return null;
}

function matchDifference(expected: MatchData, actual: MatchData | undefined) {
	if (!actual) return "match is gone";

	const describe = (match: MatchData) =>
		[match.opponent1, match.opponent2]
			.map((opponent) =>
				opponent === null
					? "BYE"
					: `${opponent.id ?? "TBD"}${opponent.position ? `#${opponent.position}` : ""}:${opponent.score ?? "-"}`,
			)
			.join(" vs ")
			.concat(` winner ${match.winnerSide ?? "-"}`);

	return describe(expected) === describe(actual)
		? null
		: `expected ${describe(expected)}, got ${describe(actual)}`;
}

function pairKey(oneId: number, twoId: number) {
	return oneId < twoId ? `${oneId}-${twoId}` : `${twoId}-${oneId}`;
}

function randomChoice(random: RandomSource): BracketSimulator.Choice {
	const total = STEP_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
	let roll = random.randomInteger(total);
	let kind = STEP_WEIGHTS[0][0];
	for (const [candidate, weight] of STEP_WEIGHTS) {
		if (roll < weight) {
			kind = candidate;
			break;
		}
		roll -= weight;
	}

	return {
		kind,
		// the earliest playable matches most of the time, so brackets get played through
		a: random.randomInteger(4) === 0 ? random.randomInteger(1000) : 0,
		b: random.randomInteger(2),
	};
}

function randomScenario(random: RandomSource): BracketSimulator.Scenario {
	const pickOne = <T>(options: T[]) =>
		options[random.randomInteger(options.length)];
	const base = { requiresCheckIn: false };

	const scenarios: Array<() => Omit<BracketSimulator.Scenario, "maps">> = [
		() => ({
			label: "single elimination",
			teamCount: random.randomInteger(2, 20),
			progression: [
				{
					...base,
					type: "single_elimination",
					name: "Main",
					settings: pickOne([
						{},
						{},
						{ skippedRounds: ["THIRD_PLACE_MATCH" as const] },
					]),
				},
			],
		}),
		() => ({
			label: "double elimination",
			teamCount: random.randomInteger(2, 20),
			progression: [
				{ ...base, type: "double_elimination", name: "Main", settings: {} },
			],
		}),
		() => ({
			label: "round robin",
			teamCount: random.randomInteger(3, 13),
			progression: [
				{
					...base,
					type: "round_robin",
					name: "Main",
					settings: { teamsPerGroup: random.randomInteger(3, 6) },
				},
			],
		}),
		() => ({
			label: "swiss",
			teamCount: random.randomInteger(4, 13),
			progression: [
				{
					...base,
					type: "swiss",
					name: "Main",
					settings: {
						groupCount: pickOne([1, 1, 2]),
						roundCount: random.randomInteger(2, 6),
					},
				},
			],
		}),
		() => ({
			label: "round robin to single elimination",
			teamCount: random.randomInteger(6, 17),
			progression: progressions.roundRobinToSingleElimination,
		}),
		() => ({
			label: "swiss to brackets (low ink)",
			teamCount: random.randomInteger(8, 17),
			progression: progressions.lowInk,
		}),
		() => ({
			label: "two starting brackets",
			teamCount: random.randomInteger(8, 17),
			progression: progressions.manyStartBrackets,
		}),
		() => ({
			label: "swiss early advance",
			teamCount: random.randomInteger(6, 13),
			progression: progressions.swissEarlyAdvance,
		}),
		() => ({
			label: "double elimination with underground",
			teamCount: random.randomInteger(6, 17),
			progression: progressions.doubleEliminationWithUnderground,
		}),
		() => ({
			label: "single elimination with underground",
			teamCount: random.randomInteger(6, 17),
			progression: progressions.singleEliminationWithUnderground,
		}),
		() => ({
			label: "pools to top cut via redemption",
			teamCount: random.randomInteger(8, 17),
			progression: progressions.multiSourceTopCutWithConsolation,
		}),
		() => ({
			label: "swiss to two single eliminations with underground",
			teamCount: random.randomInteger(16, 21),
			progression: progressions.swissToTwoSingleEliminationsWithUnderground,
		}),
	];

	const scenario = pickOne(scenarios)();

	return {
		...scenario,
		maps: scenario.progression.map((bracket) => {
			const isGroupStage =
				bracket.type === "round_robin" || bracket.type === "swiss";

			return isGroupStage && random.randomInteger(3) === 0
				? { type: "PLAY_ALL" as const, count: 3 }
				: { type: "BEST_OF" as const, count: pickOne([1, 3, 3, 5]) };
		}),
	};
}
