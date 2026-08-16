import type { LoaderFunctionArgs } from "react-router";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import type { Bracket } from "../core/Bracket";
import type { Tournament } from "../core/Tournament";
import {
	serializeBracket,
	tournamentFromParams,
} from "../core/Tournament.server";
import { tournamentBracketsSearchParams } from "../tournament-bracket-search-params";
import { showsOneGroupAtATime } from "../tournament-bracket-utils";

export type TournamentBracketsLoaderData = SerializeFrom<typeof loader>;

/**
 * Match data of the one bracket the view renders, selected by the `idx` search param.
 * The other brackets are represented by the layout's bracket state alone. Of a swiss
 * bracket only the group the view renders, selected by the `group` search param.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "view",
	});

	const searchParams = tournamentBracketsSearchParams.parse(request);

	const bracketIdx = resolveBracketIdx(tournament, searchParams.idx);
	const bracket = tournament.bracketByIdx(bracketIdx);
	const groupId = resolveGroupId(bracket, searchParams.group);

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
		groupId,
		bracket: bracket
			? serializeBracket(bracket, {
					// a preview bracket is generated whole and small, its team counts read from that
					groupId: bracket.preview ? null : groupId,
				})
			: null,
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

function resolveGroupId(bracket: Bracket | null, groupId: number | null) {
	if (!bracket || !showsOneGroupAtATime(bracket.type)) return null;

	const groupIds = bracket.data.group.map((group) => group.id);

	return groupId !== null && groupIds.includes(groupId)
		? groupId
		: (groupIds[0] ?? null);
}
