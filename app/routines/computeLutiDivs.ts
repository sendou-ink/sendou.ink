import { parseLutiDivFromName } from "../features/scrims/scrims-utils";
import * as TournamentRepository from "../features/tournament/TournamentRepository.server";
import { LEAGUES } from "../features/tournament/tournament-constants";
import * as UserRepository from "../features/user-page/UserRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

/**
 * Recomputes `User.div` (the user's division in the latest finished LUTI). Looks at the most recent
 * LUTI season whose division tournaments are all finalized and sets the division for every eligible
 * participant (on a team that did not drop out and played at least one match). Users not in that
 * season keep their previous division. Idempotent.
 */
export const ComputeLutiDivsRoutine = new Routine({
	name: "ComputeLutiDivs",
	func: async () => {
		const children = await latestFinishedLutiDivisions();
		if (!children) return;

		const updates: Array<{ userId: number; div: string }> = [];
		for (const child of children) {
			const div = parseLutiDivFromName(child.name);
			if (!div) {
				logger.warn(
					`ComputeLutiDivs: could not parse division from tournament name "${child.name}"`,
				);
				continue;
			}

			const userIds =
				await TournamentRepository.findLeagueDivParticipantUserIds(
					child.tournamentId,
				);
			for (const { userId } of userIds) {
				updates.push({ userId, div });
			}
		}

		await UserRepository.updateManyDivs(updates);
		logger.info(`ComputeLutiDivs: updated div for ${updates.length} users`);
	},
});

async function latestFinishedLutiDivisions() {
	for (const league of [...(LEAGUES.LUTI ?? [])].reverse()) {
		const children = await TournamentRepository.findChildTournamentsForDivCalc(
			league.tournamentId,
		);
		if (children.length === 0) continue;
		if (children.every((child) => child.isFinalized === 1)) {
			return children;
		}
	}

	return null;
}
