import { type LoaderFunctionArgs, redirect } from "react-router";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { tournamentDivisionsPage } from "~/utils/urls";
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
 * Match data of the one bracket (`idx` param; swiss: one group, `group` param) the view renders, the
 * others are represented by the layout's bracket state. A league shows one division (`division`
 * param), without one the divisions page is shown instead.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "view",
	});

	const searchParams = tournamentBracketsSearchParams.parse(request);

	const divisionIdx = resolveDivisionIdx(tournament, searchParams);
	const hasDivisionToShow =
		divisionIdx !== null &&
		tournament.visibleBracketsMetaOfDivision(divisionIdx).length > 0;
	if (tournament.isLeague && !hasDivisionToShow) {
		throw redirect(tournamentDivisionsPage(tournament.ctx.id));
	}

	const bracketIdx = resolveBracketIdx(
		tournament,
		searchParams.idx,
		divisionIdx,
	);
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
		divisionIdx,
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

/** Falls back to the selected bracket's division, so a link to one bracket works without naming it. */
function resolveDivisionIdx(
	tournament: Tournament,
	searchParams: { division: number | null; idx: number | null },
) {
	if (!tournament.isLeague) return null;

	const isDivision = tournament.leagueDivisions.some(
		(division) => division.idx === searchParams.division,
	);
	if (isDivision) {
		return searchParams.division;
	}

	return searchParams.idx !== null
		? tournament.leagueDivisionOfBracket(searchParams.idx)
		: null;
}

/** Always one with a tab. Without a valid `idx` the first bracket, unless it is over and followed by one the tournament continues in. */
function resolveBracketIdx(
	tournament: Tournament,
	idx: number | null,
	divisionIdx: number | null,
) {
	const visibleBrackets = tournament.visibleBracketsMetaOfDivision(divisionIdx);
	const isVisible = (idx: number) =>
		visibleBrackets.some((bracket) => bracket.idx === idx);

	if (idx !== null && isVisible(idx)) {
		return idx;
	}

	const brackets = tournament.bracketsMetaOfDivision(divisionIdx);
	const defaultBracket =
		brackets.length <= 1 ||
		brackets[1].isUnderground ||
		!brackets[0].everyMatchOver
			? brackets[0]
			: brackets[1];

	return defaultBracket && isVisible(defaultBracket.idx)
		? defaultBracket.idx
		: (visibleBrackets[0]?.idx ?? 0);
}

function resolveGroupId(bracket: Bracket | null, groupId: number | null) {
	if (!bracket || !showsOneGroupAtATime(bracket.type)) return null;

	const groupIds = bracket.data.group.map((group) => group.id);

	return groupId !== null && groupIds.includes(groupId)
		? groupId
		: (groupIds[0] ?? null);
}
