import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { seededRandom } from "~/utils/random";
import { err, ok, type Result } from "~/utils/result";
import type { ModeShort, StageId } from "../in-game-lists/types";
import type {
	TournamentMapListMap,
	TournamentMaplistInput,
	TournamentMaplistSource,
} from "./types";

type ModeWithStageAndScore = TournamentMapListMap & {
	score: number;
	/** A pool map rather than a team's pick, meant for the last slot. */
	isNeutral?: boolean;
	/** A neutral map some team picked, used only when the pool has nothing neither team picked in the mode. */
	isFallback?: boolean;
};

const OPTIMAL_MAPLIST_SCORE = 0;
const MAX_RECURSION_DEPTH = 5_000;
const UNFAIR_PENALTY = 100;
const FALLBACK_NEUTRAL_MAP_PENALTY = 5;
/** Below the bad last map penalty (1) so a common map still decides the match when a fixed mode order runs the picks dry. */
const EARLY_NEUTRAL_MAP_PENALTY = 0.5;

type MapListGenerationError =
	| "MAX_RECURSION_DEPTH_EXCEEDED"
	| "COULD_NOT_GENERATE_MAPLIST"
	| "MAPS_FOR_MODES_NOT_INCLUDED"
	| "DUPLICATE_MAPS_IN_MAP_POOL";

/** Map list balanced between both teams' pools. Retries once without the recently played maps consideration if it fails. */
export function generateBalancedMapList(
	input: TournamentMaplistInput,
): Result<Array<TournamentMapListMap>, MapListGenerationError> {
	const result = generateWithInput(input);

	if (
		!result.ok &&
		result.error === "MAX_RECURSION_DEPTH_EXCEEDED" &&
		input.recentlyPlayedMaps
	) {
		logger.error(
			`Failed to generate map list with recently played maps consideration. Retrying without recently played maps. Team IDs: ${input.teams.map((t) => t.id).join(", ")}`,
		);
		return generateWithInput({
			...input,
			recentlyPlayedMaps: undefined,
		});
	}

	return result;
}

function generateWithInput(
	input: TournamentMaplistInput,
): Result<Array<TournamentMapListMap>, MapListGenerationError> {
	const validationError = validateInput(input);
	if (validationError) return err(validationError);

	const { seededShuffle } = seededRandom(input.seed);
	// least recently played first so a good enough list is found before the recursion depth cap
	const stages = seededShuffle(resolveTeamStages()).sort(
		(a, b) => recencyPenalty(a) - recencyPenalty(b),
	);
	const neutralStages = seededShuffle(resolveNeutralStages()).sort(
		(a, b) => recencyPenalty(a) - recencyPenalty(b),
	);
	const mapList: Array<ModeWithStageAndScore> = [];
	const bestMapList: { maps?: Array<ModeWithStageAndScore>; score: number } = {
		score: Number.POSITIVE_INFINITY,
	};
	const usedStages = new Set<string>();
	let depth = 0;

	const backtrack = (): boolean => {
		if (++depth > MAX_RECURSION_DEPTH) {
			return false;
		}
		invariant(mapList.length <= input.count, "mapList.length > input.count");
		const mapListScore = rateMapList();
		if (typeof mapListScore === "number" && mapListScore < bestMapList.score) {
			bestMapList.maps = [...mapList];
			bestMapList.score = mapListScore;
		}

		// There can't be better map list than this
		if (bestMapList.score === OPTIMAL_MAPLIST_SCORE) {
			return true;
		}

		// a fixed mode can run the teams' picks dry before the last slot, the pool covers the rest
		const stageList = isNeutralSlot()
			? [...stages.filter((stage) => stage.score === 0), ...neutralStages]
			: fixedModeOfSlot(mapList.length)
				? [...stages, ...neutralStages]
				: stages;

		for (const stage of stageList) {
			if (!stageIsOk(stage)) continue;
			mapList.push(stage);
			usedStages.add(stageKey(stage));

			const continueSearch = backtrack();
			if (!continueSearch) return false;

			usedStages.delete(stageKey(stage));
			mapList.pop();
		}

		return true;
	};

	const searchExhausted = backtrack();

	// a list found before the depth cap is valid, only its optimality is unproven
	if (bestMapList.maps) {
		if (bestMapList.maps.some((map) => map.isFallback)) {
			logger.warn(
				`Neutral map fallback: both teams together picked every pool map of the mode. Team IDs: ${input.teams.map((t) => t.id).join(", ")}`,
			);
		}

		return ok(
			bestMapList.maps.map(
				({ score: _score, isNeutral: _neutral, isFallback: _fb, ...map }) =>
					map,
			),
		);
	}
	if (!searchExhausted) return err("MAX_RECURSION_DEPTH_EXCEEDED");

	return err("COULD_NOT_GENERATE_MAPLIST");

	function stageKey(stage: { mode: ModeShort; stageId: StageId }) {
		return `${stage.mode}-${stage.stageId}`;
	}

	/** Both teams' picks scored per team, or the whole pool when neither picked. */
	function resolveTeamStages(): Array<ModeWithStageAndScore> {
		if (neitherTeamSubmitted()) {
			return poolMaps().map((pair) => ({
				...pair,
				score: 0,
				source: "RANDOM" as const,
			}));
		}

		const sorted = input.teams
			.slice()
			.sort((a, b) => a.id - b.id) as TournamentMaplistInput["teams"];

		const result: Array<ModeWithStageAndScore> =
			sorted[0].maps.stageModePairs.map((pair) => ({
				...pair,
				score: 1,
				source: sorted[0].id as TournamentMaplistSource,
			}));

		for (const stage of sorted[1].maps.stageModePairs) {
			const alreadyIncludedStage = result.find(
				(candidate) =>
					candidate.stageId === stage.stageId && candidate.mode === stage.mode,
			);

			if (alreadyIncludedStage) {
				alreadyIncludedStage.score = 0;
				alreadyIncludedStage.source = "BOTH";
			} else {
				result.push({ ...stage, score: -1, source: sorted[1].id });
			}
		}

		// if one team didn't submit, the list can consist of only the other team's stages
		if (!bothTeamsSubmitted()) {
			for (const stageObj of result) {
				stageObj.score = 0;
			}
		}

		return result.sort((a, b) => stageKey(a).localeCompare(stageKey(b)));
	}

	/**
	 * Random neutral map candidates: pool maps neither team picked in that mode. A mode where the
	 * teams together picked the whole pool falls back to every pool map of the mode.
	 */
	function resolveNeutralStages(): Array<ModeWithStageAndScore> {
		if (neitherTeamSubmitted()) return [];

		const pool = poolMaps();
		const pickedByATeam = (pair: { mode: ModeShort; stageId: StageId }) =>
			input.teams.some((team) => team.maps.has(pair));

		return input.modesIncluded.flatMap((mode) => {
			const ofMode = pool.filter((pair) => pair.mode === mode);
			const neitherPicked = ofMode.filter((pair) => !pickedByATeam(pair));
			const candidates = neitherPicked.length > 0 ? neitherPicked : ofMode;

			return candidates.map((pair) => ({
				...pair,
				score: 0,
				source: "RANDOM" as const,
				isNeutral: true,
				isFallback: neitherPicked.length === 0,
			}));
		});
	}

	function poolMaps() {
		return input.pool.stageModePairs
			.filter((pair) => input.modesIncluded.includes(pair.mode))
			.sort((a, b) => stageKey(a).localeCompare(stageKey(b)));
	}

	function validateInput(
		args: TournamentMaplistInput,
	): MapListGenerationError | null {
		const everyMapIsOfIncludedMode = args.teams.every((team) =>
			team.maps.stageModePairs.every((pair) =>
				args.modesIncluded.includes(pair.mode),
			),
		);
		if (!everyMapIsOfIncludedMode) return "MAPS_FOR_MODES_NOT_INCLUDED";

		for (const team of args.teams) {
			const stringified = team.maps.stageModePairs.map(stageKey);
			const unique = new Set(stringified);
			if (unique.size !== stringified.length) {
				return "DUPLICATE_MAPS_IN_MAP_POOL";
			}
		}

		return null;
	}

	function bothTeamsSubmitted() {
		return input.teams.every((team) => !team.maps.isEmpty());
	}

	function neitherTeamSubmitted() {
		return input.teams.every((team) => team.maps.isEmpty());
	}

	/** The last slot, decided by a map both teams picked or a random one from the pool. */
	function isNeutralSlot() {
		return mapList.length === input.count - 1;
	}

	/** Mode fixed for the slot by the mode order, if any. */
	function fixedModeOfSlot(index: number) {
		if (!input.modeOrder || input.modeOrder.length === 0) return null;

		return input.modeOrder[index % input.modeOrder.length];
	}

	/** Maps both teams picked that could decide the match in the last slot. */
	function commonMapsForNeutralSlot() {
		if (!bothTeamsSubmitted()) return [];

		const lastSlotMode = fixedModeOfSlot(input.count - 1);

		return input.teams[0].maps.stageModePairs.filter(
			(pair) =>
				input.teams[1].maps.has(pair) &&
				(lastSlotMode === null || pair.mode === lastSlotMode),
		);
	}

	type StageValidatorInput = Pick<
		ModeWithStageAndScore,
		"score" | "stageId" | "mode" | "source"
	>;

	// rules here both shape the generated list and prune subtrees from the search
	function stageIsOk(stage: StageValidatorInput) {
		if (usedStages.has(stageKey(stage))) return false;
		if (mapListAlreadyFull()) return false;
		if (isNotFollowingModeOrder(stage)) return false;
		if (isEarlyModeRepeat(stage)) return false;
		if (isNotFollowingModePattern(stage)) return false;
		if (isMakingThingsUnfair(stage)) return false;
		if (isStageRepeatWithoutBreak(stage)) return false;
		if (isSecondPickBySameTeamInRow(stage)) return false;
		if (wouldUseUpCommonMaps(stage)) return false;

		return true;
	}

	function tournamentIsOneModeOnly() {
		return input.modesIncluded.length === 1;
	}

	function mapListAlreadyFull() {
		return mapList.length === input.count;
	}

	function isNotFollowingModeOrder(stage: StageValidatorInput) {
		const fixedMode = fixedModeOfSlot(mapList.length);
		if (!fixedMode) return false;

		return stage.mode !== fixedMode;
	}

	function isEarlyModeRepeat(stage: StageValidatorInput) {
		if (tournamentIsOneModeOnly() || input.modeOrder) return false;

		// all modes already appeared
		if (mapList.length >= input.modesIncluded.length) return false;

		return mapList.some(
			(alreadyIncludedStage) => alreadyIncludedStage.mode === stage.mode,
		);
	}

	function isNotFollowingModePattern(stage: StageValidatorInput) {
		if (tournamentIsOneModeOnly() || input.modeOrder) return false;

		// not all modes appeared yet
		if (mapList.length < input.modesIncluded.length) return false;

		let previousModeShouldBe: ModeShort | undefined;
		for (let i = 0; i < mapList.length; i++) {
			if (mapList[i].mode === stage.mode) {
				if (i === 0) {
					previousModeShouldBe = mapList[mapList.length - 1].mode;
				} else {
					previousModeShouldBe = mapList[i - 1].mode;
				}
			}
		}
		if (!previousModeShouldBe) return false;

		return mapList[mapList.length - 1].mode !== previousModeShouldBe;
	}

	// don't allow making two picks from one team in row
	function isMakingThingsUnfair(stage: StageValidatorInput) {
		// e.g. Bo5 with 100% overlap in one mode only: overlap, T1, T2, T1, RANDOM must be allowed;
		// scoring still prefers better options
		if (stage.source === "RANDOM") return false;

		const score = mapList.reduce((acc, cur) => acc + cur.score, 0);
		const newScore = score + stage.score;

		if (score !== 0 && newScore !== 0) return true;
		if (newScore !== 0 && mapList.length + 1 === input.count) return true;

		return false;
	}

	function isStageRepeatWithoutBreak(stage: StageValidatorInput) {
		const lastStage = mapList[mapList.length - 1];
		if (!lastStage) return false;

		return lastStage.stageId === stage.stageId;
	}

	function isSecondPickBySameTeamInRow(stage: StageValidatorInput) {
		const lastStage = mapList[mapList.length - 1];
		if (!lastStage) return false;
		if (stage.score === 0) return false;

		return lastStage.score === stage.score;
	}

	/** A map both teams picked is reserved for the last slot when one exists. */
	function wouldUseUpCommonMaps(stage: StageValidatorInput) {
		const commonMaps = commonMapsForNeutralSlot();
		if (commonMaps.length === 0) return false;

		// both teams having identical pools
		if (commonMaps.length === input.teams[0].maps.stageModePairs.length) {
			return false;
		}

		const newMapList = [...mapList, stage];
		if (newMapList.length === input.count) return false;

		const commonMapsLeft = commonMaps.filter(
			({ stageId, mode }) =>
				!newMapList.some(
					(pair) => pair.stageId === stageId && pair.mode === mode,
				),
		);

		return commonMapsLeft.length === 0;
	}

	function rateMapList() {
		// not a full map list
		if (mapList.length !== input.count) return;

		let score = OPTIMAL_MAPLIST_SCORE;

		const appearedMaps = new Map<StageId, number>();
		for (const stage of mapList) {
			const timesAppeared = appearedMaps.get(stage.stageId) ?? 0;

			if (timesAppeared > 0) {
				score += timesAppeared;
			}

			appearedMaps.set(stage.stageId, timesAppeared + 1);
		}

		if (!lastMapIsAGoodNeutralMap()) {
			score += 1;
		}

		const fairnessBalance = mapList.reduce((acc, cur) => acc + cur.score, 0);
		if (fairnessBalance !== 0) {
			score += UNFAIR_PENALTY;
		}

		for (const [i, map] of mapList.entries()) {
			score += recencyPenalty(map);
			if (map.isFallback) score += FALLBACK_NEUTRAL_MAP_PENALTY;
			if (map.isNeutral && i !== mapList.length - 1) {
				score += EARLY_NEUTRAL_MAP_PENALTY;
			}
		}

		return score;
	}

	function recencyPenalty(map: Pick<TournamentMapListMap, "stageId" | "mode">) {
		if (!input.recentlyPlayedMaps) return 0;

		const recentIndex = input.recentlyPlayedMaps.findIndex(
			(recent) => recent.stageId === map.stageId && recent.mode === map.mode,
		);
		if (recentIndex === -1) return 0;

		return Math.max(10 - Math.floor(recentIndex / 2) * 2, 0);
	}

	/** A map both teams picked decides the match whenever there is one that could. */
	function lastMapIsAGoodNeutralMap() {
		if (commonMapsForNeutralSlot().length === 0) return true;

		return mapList[mapList.length - 1].source === "BOTH";
	}
}
