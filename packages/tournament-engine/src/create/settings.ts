import { ENGINE_DEFAULTS } from "../constants";
import type {
	BracketData,
	CreateBracketInput,
	StageSettings,
	StageType,
	TournamentStageSettings,
} from "../types";
import { assertUnreachable } from "../utils/types";

/**
 * Resolves the user-selected settings into the engine's internal stage
 * settings, applying our defaults (seed ordering, group counts etc.).
 */
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
			};
		}
		case "double_elimination": {
			return {};
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
					settings?.groupCount ?? ENGINE_DEFAULTS.SWISS_DEFAULT_GROUP_COUNT,
				roundCount:
					settings?.roundCount ?? ENGINE_DEFAULTS.SWISS_DEFAULT_ROUND_COUNT,
			};
		}
		default: {
			assertUnreachable(type);
		}
	}
}

/**
 * How many rounds a swiss bracket was created with. Read off the stage's own
 * settings (resolved and persisted when the bracket was created) so that later
 * edits to the tournament's bracket progression can't change the advance and
 * elimination math of a bracket that already exists.
 */
export function swissRoundCount(data: BracketData): number {
	return (
		data.stage[0]?.settings.roundCount ??
		ENGINE_DEFAULTS.SWISS_DEFAULT_ROUND_COUNT
	);
}

/** Whether the bracket will include a third place match. Only possible for single elimination with at least 4 participants. */
export function hasThirdPlaceMatch(args: {
	type: StageType;
	settings: TournamentStageSettings | null;
	participantsCount: number;
}): boolean {
	if (args.type !== "single_elimination") return false;
	if (args.participantsCount < 4) return false;

	return (
		args.settings?.thirdPlaceMatch ??
		ENGINE_DEFAULTS.SE_DEFAULT_HAS_THIRD_PLACE_MATCH
	);
}

/** How many groups a round robin bracket will have, derived from the user-selected teams per group count and the participant count. */
export function roundRobinGroupCount(
	settings: TournamentStageSettings | null,
	participantsCount: number,
): number {
	const teamsPerGroup =
		settings?.teamsPerGroup ?? ENGINE_DEFAULTS.RR_DEFAULT_TEAM_COUNT_PER_GROUP;

	return Math.ceil(participantsCount / teamsPerGroup);
}
