import type { ActionFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { INVITE_CODE_LENGTH } from "~/constants";
import { requireUser } from "~/features/auth/core/user.server";
import {
	type SendouRouteHandle,
	notFoundIfFalsy,
	validate,
} from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { TEAM } from "../team-constants";
import { teamParamsSchema } from "../team-schemas.server";
import { isTeamFull, isTeamMember } from "../team-utils";

import "../team.css";

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

export const handle: SendouRouteHandle = {
	i18n: ["team"],
};

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

function validateInviteCode({
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

export default function JoinTeamPage() {
	const { t } = useTranslation(["team", "common"]);
	const { validation, teamName } = useLoaderData<{
		// not sure why using typeof loader here results validation in being typed as "string"
		validation:
			| "SHORT_CODE"
			| "INVITE_CODE_WRONG"
			| "TEAM_FULL"
			| "REACHED_TEAM_COUNT_LIMIT"
			| "VALID";
		teamName: string;
	}>();

	return (
		<Main>
			<Form method="post" className="team__invite-container">
				<div className="text-center">
					{t(`team:validation.${validation}`, { teamName })}
				</div>
				{validation === "VALID" ? (
					<SubmitButton size="big">{t("common:actions.join")}</SubmitButton>
				) : null}
			</Form>
		</Main>
	);
}
