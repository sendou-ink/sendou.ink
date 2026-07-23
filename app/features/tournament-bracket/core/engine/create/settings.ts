import type { TournamentStageSettings } from "~/db/tables";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { assertUnreachable } from "~/utils/types";
import type { CreateBracketInput, StageSettings, StageType } from "../types";

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
				swiss:
					settings?.groupCount && settings.roundCount
						? {
								groupCount: settings.groupCount,
								roundCount: settings.roundCount,
							}
						: {
								groupCount: TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT,
								roundCount: TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT,
							},
			};
		}
		default: {
			assertUnreachable(type);
		}
	}
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
		TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH
	);
}

/** How many groups a round robin bracket will have, derived from the user-selected teams per group count and the participant count. */
export function roundRobinGroupCount(
	settings: TournamentStageSettings | null,
	participantsCount: number,
): number {
	const teamsPerGroup =
		settings?.teamsPerGroup ?? TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP;

	return Math.ceil(participantsCount / teamsPerGroup);
}
