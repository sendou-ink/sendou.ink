import * as UserRepository from "~/features/user-page/UserRepository.server";
import { actAs } from "../core/actAs";

type ReplaceAllArgs = {
	userId: number;
	/** Calendar event result teams the user played on. */
	resultTeamIds: number[];
	/** Tournament teams the user played on. */
	resultTournamentTeamIds: number[];
};

/** Same write as the highlight picking page, so seed all highlights at once. */
export function replaceAll({ userId, ...args }: ReplaceAllArgs) {
	return actAs(userId, () => UserRepository.updateOwnResultHighlights(args));
}
