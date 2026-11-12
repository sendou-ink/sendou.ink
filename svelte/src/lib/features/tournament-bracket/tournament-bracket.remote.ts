import { query } from "$app/server";
import * as v from "valibot";
import { loader as tournamentLayoutLoader } from "~/features/tournament/loaders/to.$id.server";
import { loader as tournamentBracketsLoader } from "~/features/tournament-bracket/loaders/to.$id.brackets.server";
import { id } from "~/utils/schema";

/**
 * What the React app's tournament layout and brackets page load, from their very loaders, so that both apps
 * render the same data. `search` is the page's query string, which picks the bracket (`idx`) and group.
 */
export const getTournamentBracketsPage = query(
	v.object({ tournamentId: id, search: v.string() }),
	async ({ tournamentId, search }) => {
		const args = {
			params: { id: String(tournamentId) },
			request: new Request(
				`http://localhost/to/${tournamentId}/brackets${search}`,
			),
			context: {},
		} as unknown as Parameters<typeof tournamentLayoutLoader>[0];

		return {
			layout: await tournamentLayoutLoader(args),
			brackets: await tournamentBracketsLoader(args),
		};
	},
);
