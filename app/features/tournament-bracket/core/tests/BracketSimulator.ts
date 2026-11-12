import type { TournamentRoundMaps } from "~/db/tables-json";
import * as Engine from "../engine";
import type { BracketData, MatchData } from "../engine/types";
import type * as Progression from "../Progression";
import type { Tournament } from "../Tournament";
import type { TournamentData } from "../Tournament.server";
import { testTournament, tournamentCtxTeam } from "./test-utils";

/** A tournament to play: its brackets, how many teams sign up and how long the sets are. */
export interface Scenario {
	label: string;
	progression: Progression.ParsedBracket[];
	teamCount: number;
	/** Map count of every round of the bracket with the same index. */
	maps: Array<Pick<TournamentRoundMaps, "count" | "type">>;
}

/** Everything the database would hold of a running tournament. */
export interface State {
	scenario: Scenario;
	teams: TournamentData["ctx"]["teams"];
	/** Every started stage, ids unique across stages like in the database. */
	data: BracketData;
	/** Winner team ids of the games reported for a match, in order (the game result rows). */
	gamesByMatchId: Map<number, number[]>;
}

export type StepKind =
	| "START_BRACKET"
	| "REPORT_GAME"
	| "UNDO_GAME"
	| "END_SET"
	| "REOPEN"
	| "DROP_TEAM"
	| "ADVANCE_SWISS";

/**
 * One step of a sequence. `a` and `b` pick among whatever the step can act on in the state it is
 * applied to, so a step stays meaningful when steps before it are removed.
 */
export interface Choice {
	kind: StepKind;
	a: number;
	b: number;
}

/** What a {@link Choice} resolved to. */
export interface Applied {
	kind: StepKind;
	description: string;
	/** Stage the step acted on. */
	stageId?: number;
	matchId?: number;
	teamId?: number;
	/** Matches ended because a team of theirs has dropped out. */
	endedMatchIds: number[];
}

/** The tournament before any bracket is started. Team ids are their seeds. */
export function initialState(scenario: Scenario): State {
	const startingBracketIdxs = scenario.progression.flatMap((bracket, idx) =>
		bracket.sources ? [] : [idx],
	);

	return {
		scenario,
		teams: Array.from({ length: scenario.teamCount }, (_, i) =>
			tournamentCtxTeam(i + 1, {
				seed: i + 1,
				startingBracketIdx:
					startingBracketIdxs.length > 1
						? startingBracketIdxs[i % startingBracketIdxs.length]
						: null,
			}),
		),
		data: { stage: [], group: [], round: [], match: [] },
		gamesByMatchId: new Map(),
	};
}

/** The state as the app sees it. */
export function tournamentOf(state: State): Tournament {
	return testTournament({
		data: state.data,
		ctx: {
			settings: { bracketProgression: state.scenario.progression },
			teams: state.teams,
		},
	});
}

/** Data of one started stage. */
export function stageData(data: BracketData, stageId: number): BracketData {
	return {
		stage: data.stage.filter((stage) => stage.id === stageId),
		group: data.group.filter((group) => group.stageId === stageId),
		round: data.round.filter((round) => round.stageId === stageId),
		match: data.match.filter((match) => match.stageId === stageId),
	};
}

/**
 * Applies the step the way the matching action does: same guards, same engine call, same follow-up
 * (ending the matches of dropped teams). `applied` is null when the step has nothing to act on.
 */
export function apply(
	state: State,
	choice: Choice,
): { state: State; applied: Applied | null } {
	const tournament = tournamentOf(state);
	const pick = <T>(candidates: T[]) =>
		candidates.length > 0 ? candidates[choice.a % candidates.length] : null;
	const nothing = { state, applied: null };

	switch (choice.kind) {
		case "START_BRACKET": {
			const bracket = pick(
				tournament.brackets.filter(
					(candidate) => candidate.preview && candidate.canBeStarted,
				),
			);
			if (!bracket?.previewSeeding) return nothing;

			const created = Engine.create({
				type: bracket.type,
				seeding: bracket.previewSeeding,
				settings: bracket.settings,
			});
			const maps = state.scenario.maps[bracket.idx];
			const offset = nextId(state.data);
			const stageId = offset;

			return {
				state: {
					...state,
					data: {
						stage: [
							...state.data.stage,
							{
								...created.stage[0],
								id: stageId,
								name: bracket.name,
								number: state.data.stage.length + 1,
							},
						],
						group: [
							...state.data.group,
							...created.group.map((group) => ({
								...group,
								id: group.id + offset,
								stageId,
							})),
						],
						round: [
							...state.data.round,
							...created.round.map((round) => ({
								...round,
								id: round.id + offset,
								groupId: round.groupId + offset,
								stageId,
								maps: { ...maps, list: null },
							})),
						],
						match: [
							...state.data.match,
							...created.match.map((match) => ({
								...match,
								id: match.id + offset,
								roundId: match.roundId + offset,
								groupId: match.groupId + offset,
								stageId,
							})),
						],
					},
				},
				applied: {
					kind: choice.kind,
					description: `start bracket ${bracket.idx} "${bracket.name}" (${bracket.type}) with teams ${bracket.previewSeeding.join(", ")}`,
					stageId,
					endedMatchIds: [],
				},
			};
		}
		case "REPORT_GAME": {
			const match = pick(playableMatches(state.data));
			if (!match) return nothing;

			const winnerTeamId = teamOfSide(match, choice.b);
			const reported = Engine.reportGameResult(state.data, {
				matchId: match.id,
				winnerTeamId,
			});
			const ended = reported.setOver
				? Engine.endDroppedTeamMatches(reported.data, droppedTeamIds(state))
				: null;

			return {
				state: {
					...state,
					data: ended?.data ?? reported.data,
					gamesByMatchId: withGames(state, match.id, (games) => [
						...games,
						winnerTeamId,
					]),
				},
				applied: {
					kind: choice.kind,
					description: `report game in ${describeMatch(state.data, match)}: team ${winnerTeamId} wins`,
					stageId: match.stageId,
					matchId: match.id,
					endedMatchIds: ended?.endedMatchIds ?? [],
				},
			};
		}
		case "UNDO_GAME": {
			const match = pick(
				playableMatches(state.data).filter(
					(candidate) =>
						(state.gamesByMatchId.get(candidate.id) ?? []).length > 0,
				),
			);
			if (!match) return nothing;

			const games = state.gamesByMatchId.get(match.id)!;

			return {
				state: {
					...state,
					data: Engine.undoGameResult(state.data, {
						matchId: match.id,
						lastGameWinnerTeamId: games.at(-1)!,
					}).data,
					gamesByMatchId: withGames(state, match.id, (all) => all.slice(0, -1)),
				},
				applied: {
					kind: choice.kind,
					description: `undo last game of ${describeMatch(state.data, match)}`,
					stageId: match.stageId,
					matchId: match.id,
					endedMatchIds: [],
				},
			};
		}
		case "END_SET": {
			const match = pick(playableMatches(state.data));
			if (!match) return nothing;

			const winnerTeamId = teamOfSide(match, choice.b);
			const ended = Engine.endDroppedTeamMatches(
				Engine.endSet(state.data, { matchId: match.id, winnerTeamId }).data,
				droppedTeamIds(state),
			);

			return {
				state: { ...state, data: ended.data },
				applied: {
					kind: choice.kind,
					description: `end set ${describeMatch(state.data, match)}: team ${winnerTeamId} wins`,
					stageId: match.stageId,
					matchId: match.id,
					endedMatchIds: ended.endedMatchIds,
				},
			};
		}
		case "REOPEN": {
			const match = pick(
				state.data.match.filter(
					(candidate) =>
						candidate.winnerSide &&
						candidate.opponent1?.id &&
						candidate.opponent2?.id &&
						tournament.matchCanBeReopened(candidate.id),
				),
			);
			if (!match) return nothing;

			const games = state.gamesByMatchId.get(match.id) ?? [];
			const reopened = Engine.reopenMatch(state.data, {
				matchId: match.id,
				lastGameWinnerTeamId: games.at(-1) ?? null,
			});

			return {
				state: {
					...state,
					data: reopened.data,
					gamesByMatchId: reopened.endedEarly
						? state.gamesByMatchId
						: withGames(state, match.id, (all) => all.slice(0, -1)),
				},
				applied: {
					kind: choice.kind,
					description: `reopen ${describeMatch(state.data, match)}`,
					stageId: match.stageId,
					matchId: match.id,
					endedMatchIds: [],
				},
			};
		}
		case "DROP_TEAM": {
			const team = pick(
				tournament.ctx.teams.filter(
					(candidate) =>
						!candidate.droppedOut &&
						!tournament.bracketByIdx(
							tournament.startingBracketIdxOfTeam(candidate),
						)?.preview,
				),
			);
			if (!team) return nothing;

			const teams = state.teams.map((candidate) =>
				candidate.id === team.id
					? { ...candidate, droppedOut: 1 as const }
					: candidate,
			);
			const ended = Engine.endDroppedTeamMatches(
				state.data,
				droppedTeamIds({ teams }),
			);

			return {
				state: { ...state, teams, data: ended.data },
				applied: {
					kind: choice.kind,
					description: `drop team ${team.id}`,
					teamId: team.id,
					endedMatchIds: ended.endedMatchIds,
				},
			};
		}
		case "ADVANCE_SWISS": {
			const round = pick(
				tournament.brackets
					.filter((bracket) => !bracket.preview && bracket.type === "swiss")
					.flatMap((bracket) =>
						bracket.data.group.flatMap((group) => {
							const generated = Engine.generateRound(bracket.data, {
								groupId: group.id,
								standings: bracket.standings,
								settings: bracket.settings,
							});

							return generated.ok
								? [{ bracket, generated: generated.value }]
								: [];
						}),
					),
			);
			if (!round) return nothing;

			const offset = nextId(state.data);

			return {
				state: {
					...state,
					data: {
						...state.data,
						match: [
							...state.data.match,
							...round.generated.matches.map((match, i) => ({
								...match,
								id: offset + i,
								stageId: round.bracket.id,
								groupId: round.generated.groupId,
								roundId: round.generated.roundId,
								winnerSide: null,
							})),
						],
					},
				},
				applied: {
					kind: choice.kind,
					description: `pair next swiss round of group ${round.generated.groupId}: ${round.generated.matches.map((match) => `${match.opponent1?.id} vs ${match.opponent2?.id ?? "BYE"}`).join(", ")}`,
					stageId: round.bracket.id,
					endedMatchIds: [],
				},
			};
		}
	}
}

function playableMatches(data: BracketData) {
	const statuses = Engine.matchStatuses(data);

	return data.match.filter((match) => statuses.get(match.id) === "STARTED");
}

function droppedTeamIds(state: Pick<State, "teams">) {
	return state.teams.filter((team) => team.droppedOut).map((team) => team.id);
}

function teamOfSide(match: MatchData, side: number) {
	return (side % 2 === 0 ? match.opponent1 : match.opponent2)!.id!;
}

function withGames(
	state: State,
	matchId: number,
	update: (games: number[]) => number[],
) {
	return new Map(state.gamesByMatchId).set(
		matchId,
		update(state.gamesByMatchId.get(matchId) ?? []),
	);
}

function nextId(data: BracketData) {
	return (
		Math.max(
			0,
			...data.stage.map((stage) => stage.id),
			...data.group.map((group) => group.id),
			...data.round.map((round) => round.id),
			...data.match.map((match) => match.id),
		) + 1
	);
}

/** E.g. `match 12 (stage 1 winners round 2 match 1: 3 vs 5)`. */
export function describeMatch(data: BracketData, match: MatchData) {
	const round = data.round.find((candidate) => candidate.id === match.roundId);

	return `match ${match.id} (stage ${match.stageId} ${round?.section ?? "round"} ${round?.number} match ${match.number}: ${match.opponent1?.id ?? "?"} vs ${match.opponent2?.id ?? "?"})`;
}
