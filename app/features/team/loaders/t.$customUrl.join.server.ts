import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { SHORT_NANOID_LENGTH } from "~/utils/id";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";
import { teamJoinSearchParams } from "../team-search-params";
import { isTeamFull, isTeamMember, maxTeamCount } from "../team-utils";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { customUrl } = parseParams({ params, schema: teamParamsSchema });

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl, {
			includeInviteCode: true,
		}),
	);

	const { code } = teamJoinSearchParams.parse(url);
	const realInviteCode = team.inviteCode!;

	const teamCount = (await TeamRepository.findAllByMemberUserId(user.id))
		.length;

	const validation = validateInviteCode({
		inviteCode: code ?? "",
		realInviteCode,
		team,
		user,
		reachedTeamCountLimit: teamCount >= maxTeamCount(user),
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
	user?: { id: number };
	reachedTeamCountLimit: boolean;
}) {
	if (inviteCode.length !== SHORT_NANOID_LENGTH) {
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
