import { type ActionFunction, redirect } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import { validateInviteCode } from "../loaders/t.$customUrl.join.server";
import * as TeamRepository from "../TeamRepository.server";
import { TEAM } from "../team-constants";
import { teamParamsSchema } from "../team-schemas.server";
import { teamJoinSearchParams } from "../team-search-params";

export const action: ActionFunction = async ({ params, url }) => {
	const user = requireUser();
	const { customUrl } = v.parse(teamParamsSchema, params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl, {
			includeInviteCode: true,
		}),
	);

	const { code } = teamJoinSearchParams.parse(url);
	const realInviteCode = team.inviteCode!;

	errorToastIfFalsy(
		validateInviteCode({
			inviteCode: code ?? "",
			realInviteCode,
			team,
			user,
			reachedTeamCountLimit: false, // checked in the DB transaction
		}) === "VALID",
		"Invite code is invalid",
	);

	await TeamRepository.insertOwnMembership({
		maxTeamsAllowed:
			user.patronTier && user.patronTier >= 2
				? TEAM.MAX_TEAM_COUNT_PATRON
				: TEAM.MAX_TEAM_COUNT_NON_PATRON,
		teamId: team.id,
	});

	throw redirect(teamPage(team.customUrl));
};
