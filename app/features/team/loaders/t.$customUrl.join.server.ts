import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { INVITE_CODE_LENGTH } from "~/constants";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { TEAM } from "../team-constants";
import { teamParamsSchema } from "../team-schemas.server";
import { isTeamFull, isTeamMember } from "../team-utils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(
		await TeamRepository.findByCustomUrl(customUrl, {
			includeInviteCode: true,
		}),
	);

	const inviteCode = new URL(request.url).searchParams.get("code") ?? "";
	const realInviteCode = team.inviteCode!;

	const teamCount = (await TeamRepository.teamsByMemberUserId(user.id)).length;

	const validation = validateInviteCode({
		inviteCode,
		realInviteCode,
		team,
		user,
		reachedTeamCountLimit:
			user.patronTier && user.patronTier >= 2
				? teamCount >= TEAM.MAX_TEAM_COUNT_PATRON
				: teamCount >= TEAM.MAX_TEAM_COUNT_NON_PATRON,
	});

	if (validation === "ALREADY_JOINED") {
		throw redirect(teamPage(team.customUrl));
	}

	return {
		validation,
		teamName: team.name,
	};
};

export function validateInviteCode({
	inviteCode,
	realInviteCode,
	team,
	user,
	reachedTeamCountLimit,
}: {
	inviteCode: string;
	realInviteCode: string;
	team: TeamRepository.findByCustomUrl;
	user?: { id: number; team?: { name: string } };
	reachedTeamCountLimit: boolean;
}) {
	if (inviteCode.length !== INVITE_CODE_LENGTH) {
		return "SHORT_CODE";
	}
	if (inviteCode !== realInviteCode) {
		return "INVITE_CODE_WRONG";
	}
	if (isTeamFull(team)) {
		return "TEAM_FULL";
	}
	if (isTeamMember({ team, user })) {
		return "ALREADY_JOINED";
	}
	if (reachedTeamCountLimit) {
		return "REACHED_TEAM_COUNT_LIMIT";
	}

	return "VALID";
}
