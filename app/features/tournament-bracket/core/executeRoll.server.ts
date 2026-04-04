import type { TournamentRoundMaps } from "~/db/tables";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { seededRandom } from "~/utils/random";
import { errorIsSqliteUniqueConstraintFailure } from "~/utils/sql";
import type { findResultsByMatchId } from "../queries/findResultsByMatchId.server";
import * as PickBan from "./PickBan";
import type { TournamentDataTeam } from "./Tournament.server";

export async function executeRoll({
	matchId,
	maps,
	pickBanEvents,
	results,
	tournamentId,
	teams,
	tieBreakerMapPool,
}: {
	matchId: number;
	maps: TournamentRoundMaps;
	pickBanEvents: Awaited<
		ReturnType<typeof TournamentRepository.pickBanEventsByMatchId>
	>;
	results: ReturnType<typeof findResultsByMatchId>;
	tournamentId: number;
	teams: [TournamentDataTeam, TournamentDataTeam];
	tieBreakerMapPool: ModeWithStage[];
}): Promise<boolean> {
	const customFlow = maps.customFlow;
	if (!customFlow) return false;

	const step = PickBan.resolveCurrentStep({
		eventCount: pickBanEvents.length,
		preSet: customFlow.preSet,
		postGame: customFlow.postGame,
		resultsCount: results.length,
	});

	if (!step || step.action !== "ROLL") return false;

	const toSetMapPool =
		await TournamentRepository.findTOSetMapPoolById(tournamentId);
	const legalMaps = PickBan.mapsListWithLegality({
		toSetMapPool,
		maps,
		mapList: null,
		teams,
		tieBreakerMapPool,
		pickerTeamId: teams[0].id,
		results,
		pickBanEvents,
	}).filter((m) => m.isLegal);

	invariant(legalMaps.length > 0, "Unexpected no legal maps");

	const eventNumber = pickBanEvents.length + 1;
	const { randomInteger } = seededRandom(`roll-${matchId}-${eventNumber}`);
	const selectedMap = legalMaps[randomInteger(legalMaps.length)]!;

	try {
		await TournamentRepository.addPickBanEvent({
			authorId: null,
			matchId,
			stageId: selectedMap.stageId,
			mode: selectedMap.mode,
			number: eventNumber,
			type: "ROLL",
		});
	} catch (error) {
		if (!errorIsSqliteUniqueConstraintFailure(error)) {
			throw error;
		}
		// unique constraint violation — another request already handled this roll
	}

	return true;
}
