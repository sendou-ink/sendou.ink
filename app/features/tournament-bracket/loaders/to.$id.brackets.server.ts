import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import {
	requireTournamentVisible,
	serializeBracket,
	tournamentSharedCached,
} from "../core/Tournament.server";
import { tournamentBracketsSearchParams } from "../tournament-bracket-search-params";

export type TournamentBracketsLoaderData = SerializeFrom<typeof loader>;

/**
 * Match data of the one bracket the view renders, selected by the `idx` search param.
 * The other brackets are represented by the layout's bracket state alone.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentSharedCached(tournamentId);
	requireTournamentVisible({ ctx: tournament.ctx, user });

	const bracketIdx = resolveBracketIdx(
		tournament,
		tournamentBracketsSearchParams.parse(request).idx,
	);
	const bracket = tournament.bracketByIdx(bracketIdx);

	return {
		bracketIdx,
		bracket: bracket ? serializeBracket(bracket) : null,
		teamProgressStatus: tournament.teamMemberOfProgressStatus(user),
	};
};

/**
 * The bracket to show when the view was opened without one: the first bracket, unless it is
 * over and followed by a bracket the tournament actually continues in.
 */
function resolveBracketIdx(
	tournament: Awaited<ReturnType<typeof tournamentSharedCached>>,
	idx: number | null,
) {
	if (idx !== null && tournament.bracketMetaByIdx(idx)) {
		return idx;
	}

	const brackets = tournament.bracketsMeta;
	if (
		brackets.length <= 1 ||
		brackets[1].isUnderground ||
		!brackets[0].everyMatchOver
	) {
		return 0;
	}

	return 1;
}
