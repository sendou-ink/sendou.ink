import type { LoaderFunctionArgs } from "react-router";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import type { Tournament } from "../core/Tournament";
import {
	serializeBracket,
	tournamentFromParams,
} from "../core/Tournament.server";
import { tournamentBracketsSearchParams } from "../tournament-bracket-search-params";

export type TournamentBracketsLoaderData = SerializeFrom<typeof loader>;

/**
 * Match data of the one bracket the view renders, selected by the `idx` search param.
 * The other brackets are represented by the layout's bracket state alone.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "view",
	});

	const bracketIdx = resolveBracketIdx(
		tournament,
		tournamentBracketsSearchParams.parse(request).idx,
	);
	const bracket = tournament.bracketByIdx(bracketIdx);

	if (user) {
		await resolveNotifications({
			userIds: [user.id],
			type: "TO_BRACKET_STARTED",
			meta: { tournamentId: tournament.ctx.id, bracketIdx },
		});
	}

	const ownedTeam = tournament.ownedTeamByUser(user);

	return {
		bracketIdx,
		bracket: bracket ? serializeBracket(bracket) : null,
		// the invite link of the add subs popover, only the team's own captain sees it
		ownTeamInviteCode: ownedTeam
			? await TournamentTeamRepository.findInviteCodeById(ownedTeam.id)
			: null,
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
function resolveBracketIdx(tournament: Tournament, idx: number | null) {
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
