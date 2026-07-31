import * as UserRepository from "~/features/user-page/UserRepository.server";
import { actAs } from "../core/actAs";

type ReplaceAllArgs = {
	userId: number;
	/** Calendar event result teams the user played on. */
	resultTeamIds: number[];
	/** Tournament teams the user played on. */
	resultTournamentTeamIds: number[];
};

/**
 * Replaces the results a user has highlighted on their profile, the same write the
 * highlight picking page does. A later call replaces the earlier's highlights, so
 * seed them all at once.
 */
export function replaceAll({ userId, ...args }: ReplaceAllArgs) {
	return actAs(userId, () => UserRepository.updateOwnResultHighlights(args));
}
