import * as R from "remeda";
import type {
	ActionType,
	CustomPickBanStep,
	TournamentRoundMaps,
	WhoSide,
} from "~/db/tables";
import type {
	ModeShort,
	ModeWithStage,
	StageId,
} from "~/modules/in-game-lists/types";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import { isSetOverByResults } from "../tournament-bracket-utils";
import type { TournamentDataTeam } from "./Tournament.server";

export const types = [
	"COUNTERPICK",
	"COUNTERPICK_MODE_REPEAT_OK",
	"BAN_2",
	"CUSTOM",
] as const;
export type Type = (typeof types)[number];

export interface PickBanTeam {
	id: number;
	seed: number;
}

export interface TurnOfResult {
	teamId: number;
	action: ActionType;
	stepCurrent?: number;
	stepTotal?: number;
}

export function turnOf({
	results,
	maps,
	teams,
	mapList,
	pickBanEventCount,
}: {
	results: Array<{ winnerTeamId: number }>;
	maps: TournamentRoundMaps;
	teams: [PickBanTeam, PickBanTeam];
	mapList?: TournamentMapListMap[] | null;
	pickBanEventCount?: number;
}): TurnOfResult | null {
	if (!maps.pickBan) return null;

	switch (maps.pickBan) {
		case "BAN_2": {
			if (!mapList) return null;
			if (
				isSetOverByResults({ count: maps.count, results, countType: maps.type })
			) {
				return null;
			}

			// typically lower seed is the "bottom team" and they pick first
			const [secondPicker, firstPicker] = teams;

			if (
				!mapList.some((map) => map.bannedByTournamentTeamId === firstPicker.id)
			) {
				return { teamId: firstPicker.id, action: "BAN" };
			}

			if (
				!mapList.some((map) => map.bannedByTournamentTeamId === secondPicker.id)
			) {
				return { teamId: secondPicker.id, action: "BAN" };
			}

			return null;
		}
		case "COUNTERPICK_MODE_REPEAT_OK":
		case "COUNTERPICK": {
			if (!mapList) return null;
			// there exists an unplayed map
			if (mapList.length > results.length) return null;

			if (
				isSetOverByResults({ count: maps.count, results, countType: maps.type })
			) {
				return null;
			}

			const latestWinner = results[results.length - 1]?.winnerTeamId;
			invariant(latestWinner, "turnOf: No winner found");

			const team = teams.find((team) => latestWinner !== team.id);
			invariant(team, "turnOf: No result found");

			return { teamId: team.id, action: "PICK" };
		}
		case "CUSTOM": {
			return turnOfCustom({ results, maps, teams, pickBanEventCount });
		}
		default: {
			assertUnreachable(maps.pickBan);
		}
	}
}

function turnOfCustom({
	results,
	maps,
	teams,
	pickBanEventCount,
}: {
	results: Array<{ winnerTeamId: number }>;
	maps: TournamentRoundMaps;
	teams: [PickBanTeam, PickBanTeam];
	pickBanEventCount?: number;
}): TurnOfResult | null {
	if (
		isSetOverByResults({ count: maps.count, results, countType: maps.type })
	) {
		return null;
	}

	const customFlow = maps.customFlow;
	if (!customFlow) return null;

	const eventCount = pickBanEventCount ?? 0;
	const preSet = customFlow.preSet;
	const postGame = customFlow.postGame;

	const step = resolveCurrentStep({
		eventCount,
		preSet,
		postGame,
		resultsCount: results.length,
	});
	if (!step) return null;

	// ROLL steps are handled by the server, not by a team
	if (step.action === "ROLL") return null;

	const teamId = resolveTeamFromSide({
		side: step.side!,
		teams,
		results,
	});

	const consecutiveInfo = resolveConsecutiveStepInfo({
		eventCount,
		preSet,
		postGame,
	});

	return {
		teamId,
		action: step.action,
		stepCurrent: consecutiveInfo.current,
		stepTotal: consecutiveInfo.total,
	};
}

function resolveConsecutiveStepInfo({
	eventCount,
	preSet,
	postGame,
}: {
	eventCount: number;
	preSet: CustomPickBanStep[];
	postGame: CustomPickBanStep[];
}): { current: number; total: number } {
	const inPreSet = eventCount < preSet.length;

	if (inPreSet) {
		const currentStep = preSet[eventCount]!;
		let start = eventCount;
		while (
			start > 0 &&
			preSet[start - 1]!.action === currentStep.action &&
			preSet[start - 1]!.side === currentStep.side
		) {
			start--;
		}
		let end = eventCount;
		while (
			end < preSet.length - 1 &&
			preSet[end + 1]!.action === currentStep.action &&
			preSet[end + 1]!.side === currentStep.side
		) {
			end++;
		}

		return { current: eventCount - start + 1, total: end - start + 1 };
	}

	if (postGame.length === 0) return { current: 1, total: 1 };

	const stepIndex = (eventCount - preSet.length) % postGame.length;
	const currentStep = postGame[stepIndex]!;

	let start = stepIndex;
	while (
		start > 0 &&
		postGame[start - 1]!.action === currentStep.action &&
		postGame[start - 1]!.side === currentStep.side
	) {
		start--;
	}
	let end = stepIndex;
	while (
		end < postGame.length - 1 &&
		postGame[end + 1]!.action === currentStep.action &&
		postGame[end + 1]!.side === currentStep.side
	) {
		end++;
	}

	return { current: stepIndex - start + 1, total: end - start + 1 };
}

export function resolveCurrentStep({
	eventCount,
	preSet,
	postGame,
	resultsCount,
}: {
	eventCount: number;
	preSet: CustomPickBanStep[];
	postGame: CustomPickBanStep[];
	resultsCount: number;
}): CustomPickBanStep | null {
	if (eventCount < preSet.length) {
		return preSet[eventCount]!;
	}

	invariant(
		postGame.length > 0,
		"resolveCurrentStep: postGame must not be empty",
	);

	const eventsAfterPreSet = eventCount - preSet.length;
	const stepInPostGame = eventsAfterPreSet % postGame.length;
	const completedPostGameCycles = Math.floor(
		eventsAfterPreSet / postGame.length,
	);

	// waiting for game result
	if (completedPostGameCycles > resultsCount) return null;
	if (completedPostGameCycles === resultsCount && stepInPostGame === 0) {
		return null;
	}

	return postGame[stepInPostGame]!;
}

export function resolveTeamFromSide({
	side,
	teams,
	results,
}: {
	side: WhoSide;
	teams: [PickBanTeam, PickBanTeam];
	results: Array<{ winnerTeamId: number }>;
}): number {
	switch (side) {
		case "ALPHA":
			return teams[0].id;
		case "BRAVO":
			return teams[1].id;
		case "HIGHER_SEED":
			return teams[0].seed <= teams[1].seed ? teams[0].id : teams[1].id;
		case "LOWER_SEED":
			return teams[0].seed <= teams[1].seed ? teams[1].id : teams[0].id;
		case "WINNER": {
			const lastWinner = results[results.length - 1]?.winnerTeamId;
			invariant(lastWinner, "resolveTeamFromSide: No winner found");
			return lastWinner;
		}
		case "LOSER": {
			const lastWinner = results[results.length - 1]?.winnerTeamId;
			invariant(lastWinner, "resolveTeamFromSide: No winner found");
			return teams.find((t) => t.id !== lastWinner)!.id;
		}
		default:
			assertUnreachable(side);
	}
}

export function isLegal({
	map,
	...rest
}: MapListWithStatusesArgs & { map: ModeWithStage }) {
	const pool = mapsListWithLegality(rest);

	return pool.some(
		(m) => m.mode === map.mode && m.stageId === map.stageId && m.isLegal,
	);
}

export function isModeLegal({
	mode,
	...rest
}: MapListWithStatusesArgs & { mode: ModeShort }) {
	const pool = mapsListWithLegality(rest);

	return pool.some((m) => m.mode === mode && m.isLegal);
}

export interface PickBanEvent {
	type: string;
	stageId: StageId | null;
	mode: ModeShort | null;
}

interface MapListWithStatusesArgs {
	results: Array<{ mode: ModeShort; stageId: StageId; winnerTeamId: number }>;
	maps: TournamentRoundMaps | null;
	mapList: TournamentMapListMap[] | null;
	teams: [TournamentDataTeam, TournamentDataTeam];
	pickerTeamId: number;
	tieBreakerMapPool: ModeWithStage[];
	toSetMapPool: Array<{ mode: ModeShort; stageId: StageId }>;
	pickBanEvents?: PickBanEvent[];
}
export function mapsListWithLegality(args: MapListWithStatusesArgs) {
	const mapPool = (() => {
		if (!args.maps?.pickBan) return [];
		switch (args.maps.pickBan) {
			case "BAN_2": {
				if (!args.mapList) {
					logger.warn("mapsListWithLegality: mapList is empty");
					return [];
				}
				return args.mapList;
			}
			case "COUNTERPICK_MODE_REPEAT_OK":
			case "COUNTERPICK": {
				if (args.toSetMapPool.length === 0) {
					const combinedPools = [
						...(args.teams[0].mapPool ?? []),
						...(args.teams[1].mapPool ?? []),
						...args.tieBreakerMapPool,
					];

					const result: ModeWithStage[] = [];
					for (const map of combinedPools) {
						if (
							!result.some(
								(m) => m.mode === map.mode && m.stageId === map.stageId,
							)
						) {
							result.push(map);
						}
					}

					return result;
				}

				return args.toSetMapPool;
			}
			case "CUSTOM": {
				if (args.toSetMapPool.length > 0) {
					return args.toSetMapPool;
				}

				const combinedPools = [
					...(args.teams[0].mapPool ?? []),
					...(args.teams[1].mapPool ?? []),
					...args.tieBreakerMapPool,
				];

				return R.uniqueBy(combinedPools, (m) => `${m.mode}-${m.stageId}`);
			}
			default: {
				assertUnreachable(args.maps.pickBan);
			}
		}
	})();

	const modesIncluded = R.unique(mapPool.map((m) => m.mode));

	const unavailableStagesSet = unavailableStages(args);
	const unavailableModesSetAll = unavailableModes({ ...args, modesIncluded });
	const unavailableModesSet =
		// one mode tournament
		unavailableModesSetAll.size < modesIncluded.length
			? unavailableModesSetAll
			: new Set();

	const result = mapPool.map((map) => {
		const isLegal =
			!unavailableStagesSet.has(map.stageId) &&
			!unavailableModesSet.has(map.mode);

		return { ...map, isLegal };
	});

	const everythingBanned = result.every((map) => !map.isLegal);
	if (everythingBanned) {
		return result.map((map) => ({ ...map, isLegal: true }));
	}

	return result;
}

function unavailableStages({
	results,
	mapList,
	maps,
	pickBanEvents,
}: {
	results: Array<{ mode: ModeShort; stageId: StageId }>;
	mapList?: TournamentMapListMap[] | null;
	maps: TournamentRoundMaps | null;
	pickBanEvents?: PickBanEvent[];
}): Set<StageId> {
	if (!maps?.pickBan) return new Set();

	switch (maps.pickBan) {
		case "BAN_2": {
			return new Set(
				mapList
					?.filter((m) => m.bannedByTournamentTeamId)
					.map((map) => map.stageId) ?? [],
			);
		}
		case "COUNTERPICK_MODE_REPEAT_OK":
		case "COUNTERPICK": {
			return new Set(results.map((result) => result.stageId));
		}
		case "CUSTOM": {
			const bannedStages = (pickBanEvents ?? [])
				.filter((e) => e.type === "BAN" && e.stageId !== null)
				.map((e) => e.stageId!);
			const playedStages = results.map((r) => r.stageId);
			return new Set([...bannedStages, ...playedStages]);
		}
		default: {
			assertUnreachable(maps.pickBan);
		}
	}
}

function unavailableModes({
	results,
	pickerTeamId,
	maps,
	pickBanEvents,
	modesIncluded,
}: {
	results: Array<{ mode: ModeShort; winnerTeamId: number }>;
	pickerTeamId: number;
	maps: TournamentRoundMaps | null;
	pickBanEvents?: PickBanEvent[];
	modesIncluded: ModeShort[];
}): Set<ModeShort> {
	if (
		!maps?.pickBan ||
		maps.pickBan === "BAN_2" ||
		maps.pickBan === "COUNTERPICK_MODE_REPEAT_OK"
	) {
		return new Set();
	}

	if (maps.pickBan === "CUSTOM") {
		const currentSectionEvents = currentSectionPickBanEvents({
			pickBanEvents: pickBanEvents ?? [],
			maps,
		});

		const modePick = currentSectionEvents.findLast(
			(e) => e.type === "MODE_PICK",
		);
		if (modePick?.mode) {
			return new Set(modesIncluded.filter((m) => m !== modePick.mode));
		}

		const modeBans = currentSectionEvents
			.filter((e) => e.type === "MODE_BAN" && e.mode !== null)
			.map((e) => e.mode!);

		return new Set(modeBans);
	}

	// COUNTERPICK: can't pick the same mode last won on
	const result = new Set(
		results
			.filter((result) => result.winnerTeamId === pickerTeamId)
			.slice(-1)
			.map((result) => result.mode),
	);

	return result;
}

function currentSectionPickBanEvents({
	pickBanEvents,
	maps,
}: {
	pickBanEvents: PickBanEvent[];
	maps: TournamentRoundMaps;
}): PickBanEvent[] {
	const preSetLength = maps.customFlow?.preSet.length ?? 0;
	const postGameLength = maps.customFlow?.postGame.length ?? 0;

	if (pickBanEvents.length <= preSetLength) {
		return pickBanEvents;
	}

	if (postGameLength === 0) return [];

	const eventsAfterPreSet = pickBanEvents.length - preSetLength;
	const currentCycleStart =
		preSetLength +
		Math.floor(eventsAfterPreSet / postGameLength) * postGameLength;

	return pickBanEvents.slice(currentCycleStart);
}

const BEFORE_SET_INVALID_WHO: ReadonlySet<WhoSide> = new Set([
	"WINNER",
	"LOSER",
]);

export const CUSTOM_FLOW_VALIDATION_ERRORS = {
	STEP_MISSING_ACTION: "STEP_MISSING_ACTION",
	STEP_MISSING_WHO: "STEP_MISSING_WHO",
	LAST_STEP_MUST_BE_PICK_OR_ROLL: "LAST_STEP_MUST_BE_PICK_OR_ROLL",
	WINNER_LOSER_IN_PRE_SET: "WINNER_LOSER_IN_PRE_SET",
	TOO_MANY_MODE_PICKS: "TOO_MANY_MODE_PICKS",
	TOO_MANY_MAP_PICKS: "TOO_MANY_MAP_PICKS",
	SAME_TEAM_MODE_AND_MAP_PICK: "SAME_TEAM_MODE_AND_MAP_PICK",
} as const;
export type CustomFlowValidationError =
	(typeof CUSTOM_FLOW_VALIDATION_ERRORS)[keyof typeof CUSTOM_FLOW_VALIDATION_ERRORS];

interface ValidatableStep {
	action?: ActionType;
	side?: WhoSide;
}

export function validateCustomFlowSection(
	steps: ValidatableStep[],
	section: "preSet" | "postGame",
): CustomFlowValidationError[] {
	const errors: CustomFlowValidationError[] = [];

	for (const step of steps) {
		if (!step.action) {
			errors.push(CUSTOM_FLOW_VALIDATION_ERRORS.STEP_MISSING_ACTION);
			break;
		}
		if (step.action !== "ROLL" && !step.side) {
			errors.push(CUSTOM_FLOW_VALIDATION_ERRORS.STEP_MISSING_WHO);
			break;
		}
	}

	const lastStep = steps.at(-1);
	if (
		!lastStep ||
		(lastStep.action &&
			lastStep.action !== "PICK" &&
			lastStep.action !== "ROLL")
	) {
		errors.push(CUSTOM_FLOW_VALIDATION_ERRORS.LAST_STEP_MUST_BE_PICK_OR_ROLL);
	}

	if (section === "preSet") {
		for (const step of steps) {
			if (step.side && BEFORE_SET_INVALID_WHO.has(step.side)) {
				errors.push(CUSTOM_FLOW_VALIDATION_ERRORS.WINNER_LOSER_IN_PRE_SET);
				break;
			}
		}
	}

	const modePickCount = steps.filter((s) => s.action === "MODE_PICK").length;
	if (modePickCount > 1) {
		errors.push(CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MODE_PICKS);
	}

	const mapPickCount = steps.filter(
		(s) => s.action === "PICK" || s.action === "ROLL",
	).length;
	if (mapPickCount > 1) {
		errors.push(CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MAP_PICKS);
	}

	const modePickStep = steps.find((s) => s.action === "MODE_PICK");
	const mapPickStep = steps.find((s) => s.action === "PICK");
	if (
		modePickStep?.side &&
		mapPickStep?.side &&
		modePickStep.side === mapPickStep.side
	) {
		errors.push(CUSTOM_FLOW_VALIDATION_ERRORS.SAME_TEAM_MODE_AND_MAP_PICK);
	}

	return errors;
}
