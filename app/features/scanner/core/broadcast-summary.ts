/**
 * What a linked broadcast's scenes after a game show of it, trimmed off the
 * game's built match (see broadcast's `BroadcastGameSummary`).
 */
import type {
	BroadcastGameSummary,
	BroadcastGameSummaryPlayer,
	BroadcastObjectiveRead,
} from "~/features/broadcast/broadcast-types";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import type { DetectedEvent } from "./detectors/types";
import type { BuiltMatch } from "./match-builder";
import type {
	ScannerMatchObjective,
	ScannerMatchPlayer,
} from "./scanner-match";

/**
 * The game's summary for the broadcast: its teams in the match's order with
 * the inks the minimap showed them in, each player's main abilities only and
 * the counter reads where the count or who holds the objective changed (the
 * last one kept too), `t` counted from the first.
 */
export function gameSummary(
	built: BuiltMatch<DetectedEvent>,
	{ isKnockout }: { isKnockout: boolean },
): BroadcastGameSummary {
	const { match } = built;

	return {
		mode: match.mode,
		stageId: match.stage,
		isKnockout,
		winner: match.winner,
		inks: built.inks ?? [null, null],
		teams: [
			{ players: match.teams[0].players.map(summaryPlayer) },
			{ players: match.teams[1].players.map(summaryPlayer) },
		],
		objective: objectiveReads(match.objective),
	};
}

function summaryPlayer(player: ScannerMatchPlayer): BroadcastGameSummaryPlayer {
	const mains: AbilityWithUnknown[] = [0, 1, 2].map(
		(row) => player.abilities?.[row]?.[0] ?? "UNKNOWN",
	);

	return {
		name: player.name,
		weaponSplId: player.weaponId,
		abilities: mains.every((main) => main === "UNKNOWN") ? [] : mains,
	};
}

function objectiveReads(
	objective: ScannerMatchObjective | null,
): BroadcastObjectiveRead[] {
	const samples = objective?.samples ?? [];
	const start = samples[0]?.t ?? 0;

	return samples.flatMap((sample, i): BroadcastObjectiveRead[] => {
		const previous = samples[i - 1];
		const isLast = i === samples.length - 1;
		if (
			previous &&
			!isLast &&
			previous.score[0] === sample.score[0] &&
			previous.score[1] === sample.score[1] &&
			previous.control === sample.control
		) {
			return [];
		}

		return [
			{ t: sample.t - start, score: sample.score, control: sample.control },
		];
	});
}
