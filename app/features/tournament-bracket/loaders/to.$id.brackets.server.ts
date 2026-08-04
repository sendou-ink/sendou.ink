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
		// the layout does not ship these, standings derived in the view need them
		participatedUserIds: tournament.participatedUserIds,
		teamProgressStatus: tournament.teamMemberOfProgressStatus(user),
		// the match cards' LIVE badges need these, also not shipped by the layout
		streams: tournament.streams,
	};
};

/**
 * The bracket to show, always one of the brackets the view actually renders a tab for. Without
 * a valid `idx` the first bracket, unless it is over and followed by a bracket the tournament
 * actually continues in.
 */
function resolveBracketIdx(
	tournament: Awaited<ReturnType<typeof tournamentSharedCached>>,
	idx: number | null,
) {
	const visibleBrackets = tournament.visibleBracketsMeta;
	const isVisible = (idx: number) =>
		visibleBrackets.some((bracket) => bracket.idx === idx);

	if (idx !== null && isVisible(idx)) {
		return idx;
	}

	const brackets = tournament.bracketsMeta;
	const defaultIdx =
		brackets.length <= 1 ||
		brackets[1].isUnderground ||
		!brackets[0].everyMatchOver
			? 0
			: 1;

	return isVisible(defaultIdx) ? defaultIdx : (visibleBrackets[0]?.idx ?? 0);
}
