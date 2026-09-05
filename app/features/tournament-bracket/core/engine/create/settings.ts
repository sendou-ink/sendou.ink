import type { TournamentStageSettings } from "~/db/tables-json";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { assertUnreachable } from "~/utils/types";
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

/** Only possible for single elimination with at least 4 participants. */
export function hasThirdPlaceMatch(args: {
	type: StageType;
	settings: TournamentStageSettings | null;
	participantsCount: number;
}): boolean {
	if (args.type !== "single_elimination") return false;
	if (args.participantsCount < 4) return false;

	return (
		args.settings?.thirdPlaceMatch ??
		TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH
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
