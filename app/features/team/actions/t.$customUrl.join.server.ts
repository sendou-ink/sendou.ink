import { type ActionFunction, redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfFalsy, validate } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { validateInviteCode } from "../loaders/t.$customUrl.join.server";
import { TEAM } from "../team-constants";
import { teamParamsSchema } from "../team-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUser(request);
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(
		await TeamRepository.findByCustomUrl(customUrl, {
			includeInviteCode: true,
		}),
	);

	const inviteCode = new URL(request.url).searchParams.get("code") ?? "";
	const realInviteCode = team.inviteCode!;

	validate(
		validateInviteCode({
			inviteCode,
			realInviteCode,
			team,
			user,
			reachedTeamCountLimit: false, // checked in the DB transaction
		}) === "VALID",
		"Invite code is invalid",
	);

	await TeamRepository.addNewTeamMember({
		maxTeamsAllowed:
			user.patronTier && user.patronTier >= 2
				? TEAM.MAX_TEAM_COUNT_PATRON
				: TEAM.MAX_TEAM_COUNT_NON_PATRON,
		teamId: team.id,
		userId: user.id,
	});

	throw redirect(teamPage(team.customUrl));
};
