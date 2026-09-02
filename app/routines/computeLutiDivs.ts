import { parseLutiDivFromName } from "../features/scrims/scrims-utils";
import * as TournamentRepository from "../features/tournament/TournamentRepository.server";
import { LUTI_ORGANIZATION_ID } from "../features/tournament-organization/tournament-organization-constants";
import * as UserRepository from "../features/user-page/UserRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

/** Excludes the other leagues of the organization e.g. FLUTI */
export const LUTI_NAME_PREFIX = "LUTI";

/**
 * Recomputes `User.div` from the latest finalized LUTI season for every eligible participant (team
 * did not drop out, played at least one match). Others keep their previous division. Idempotent.
 */
export const ComputeLutiDivsRoutine = new Routine({
	name: "ComputeLutiDivs",
	func: async () => {
		const league =
			await TournamentRepository.findLatestFinalizedLeagueParticipants({
				organizationId: LUTI_ORGANIZATION_ID,
				namePrefix: LUTI_NAME_PREFIX,
			});
		if (!league) return;

		const divByBracketIdx = new Map<number, string | null>();
		const divOfBracket = (bracketIdx: number) => {
			if (!divByBracketIdx.has(bracketIdx)) {
				const bracketName = league.bracketProgression[bracketIdx]?.name;
				const div = bracketName ? parseLutiDivFromName(bracketName) : null;
				if (!div) {
					logger.warn(
						`ComputeLutiDivs: could not parse division from bracket name "${bracketName}"`,
					);
				}
				divByBracketIdx.set(bracketIdx, div);
			}

			return divByBracketIdx.get(bracketIdx)!;
		};

		const updates: Array<{ userId: number; div: string }> = [];
		for (const participant of league.participants) {
			const div = divOfBracket(participant.startingBracketIdx ?? 0);
			if (!div) continue;

			updates.push({ userId: participant.userId, div });
		}

		await UserRepository.updateManyDivs(updates);
		logger.info(
			`ComputeLutiDivs: updated div for ${updates.length} users based on tournament ${league.tournamentId}`,
		);
	},
});
