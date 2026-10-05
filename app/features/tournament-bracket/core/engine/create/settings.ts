import type { TournamentStageSettings } from "~/db/tables-json";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { assertUnreachable } from "~/utils/types";
import * as SkippedRounds from "../../SkippedRounds";
import type {
	BracketData,
	CreateBracketInput,
	StageSettings,
	StageType,
} from "../types";

/** User-selected settings to internal stage settings, applying defaults (seed ordering, group counts etc.). */
export function resolveStageSettings(input: CreateBracketInput): StageSettings {
	const { type, settings, seeding } = input;

	switch (type) {
		case "single_elimination": {
			return {
				consolationFinal: hasThirdPlaceMatch({
					type,
					settings,
					participantsCount: seeding.length,
				}),
				...eliminationGroupAndSkipSettings(type, settings, seeding.length),
			};
		}
		case "double_elimination": {
			return eliminationGroupAndSkipSettings(type, settings, seeding.length);
		}
		case "round_robin": {
			return {
				groupCount: roundRobinGroupCount(settings, seeding.length),
				hasAbDivisions: settings?.hasAbDivisions ?? false,
				...(input.independentRounds ? { independentRounds: true } : {}),
			};
		}
		case "swiss": {
			return {
				groupCount:
					settings?.groupCount ?? TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT,
				roundCount:
					settings?.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT,
			};
		}
		default: {
			assertUnreachable(type);
		}
	}
}

/** Off the stage's own persisted settings so later progression edits can't change an existing bracket's advance/elimination math. */
export function swissRoundCount(data: BracketData): number {
	return (
		data.stage[0]?.settings.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT
	);
}

/** Only possible for single elimination with at least 4 participants (in its biggest group when grouped) and the semifinals played. */
function hasThirdPlaceMatch(args: {
	type: StageType;
	settings: TournamentStageSettings | null;
	participantsCount: number;
}): boolean {
	if (args.type !== "single_elimination") return false;

	const biggestGroupSize = Math.ceil(
		args.participantsCount /
			eliminationGroupCount(args.settings, args.participantsCount),
	);
	if (biggestGroupSize < 4) return false;

	const skipped = SkippedRounds.normalized(
		args.type,
		args.settings?.skippedRounds,
	);
	if (skipped.includes("THIRD_PLACE_MATCH")) return false;

	return TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH;
}

/** Whether the third place match can share the finals' map list, i.e. both are played. */
export function thirdPlaceMatchLinkable(args: {
	type: StageType;
	settings: TournamentStageSettings | null;
	participantsCount: number;
}): boolean {
	if (!hasThirdPlaceMatch(args)) return false;

	return !SkippedRounds.normalized(
		"single_elimination",
		args.settings?.skippedRounds,
	).includes("FINALS");
}

/**
 * Groups of a single or double elimination stage, 1 unless it is split into groups. Too few participants
 * for the selected count leaves fewer groups, every group having at least 2 participants.
 */
export function eliminationGroupCount(
	settings: TournamentStageSettings | null,
	participantsCount: number,
): number {
	return Math.max(
		1,
		Math.min(settings?.groupCount ?? 1, Math.floor(participantsCount / 2)),
	);
}

/** Round robin group count from the user-selected teams per group and the participant count. */
export function roundRobinGroupCount(
	settings: TournamentStageSettings | null,
	participantsCount: number,
): number {
	const teamsPerGroup =
		settings?.teamsPerGroup ?? TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP;

	return Math.ceil(participantsCount / teamsPerGroup);
}

function eliminationGroupAndSkipSettings(
	type: "single_elimination" | "double_elimination",
	settings: TournamentStageSettings | null,
	participantsCount: number,
): StageSettings {
	const groupCount = eliminationGroupCount(settings, participantsCount);
	const skippedRounds = SkippedRounds.normalized(
		type,
		settings?.skippedRounds,
	).filter((round) => round !== "THIRD_PLACE_MATCH");

	return {
		...(groupCount > 1 ? { groupCount } : {}),
		...(skippedRounds.length > 0 ? { skippedRounds } : {}),
	};
}
