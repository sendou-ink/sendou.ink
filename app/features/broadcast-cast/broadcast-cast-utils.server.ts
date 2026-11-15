import { findProgram } from "~/features/broadcast/broadcast-utils.server";
import * as CastChannel from "./core/CastChannel";

/**
 * The cast broadcast a user's OBS URL shows, by the URL's key (see `findProgram`), `null` for an unknown key.
 * `broadcast` is also `null` once its channel is no longer one of the tournament's cast accounts.
 */
export async function findCastProgram(programKey: string | null) {
	const program = await findProgram(programKey);
	if (!program) return null;

	const channel = program.tournament
		? CastChannel.list(program.tournament.ctx.castAccounts).find(
				(candidate) =>
					candidate.platform === program.platform &&
					candidate.account === program.account,
			)
		: undefined;

	return {
		id: program.id,
		broadcast:
			program.tournament && channel
				? { tournamentId: program.tournament.ctx.id, slug: channel.slug }
				: null,
	};
}
