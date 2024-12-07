import { redirect } from "@remix-run/node";
import type {
	ActionFunction,
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { Alert } from "~/components/Alert";
import { Button } from "~/components/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { requireUserId } from "~/features/auth/core/user.server";
import { isAdmin } from "~/permissions";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	notFoundIfFalsy,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import { assertUnreachable } from "~/utils/types";
import {
	TEAM_SEARCH_PAGE,
	joinTeamPage,
	navIconUrl,
	teamPage,
} from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { editRole } from "../queries/editRole.server";
import { inviteCodeById } from "../queries/inviteCodeById.server";
import { resetInviteLink } from "../queries/resetInviteLink.server";
import { transferOwnership } from "../queries/transferOwnership.server";
import { TEAM_MEMBER_ROLES } from "../team-constants";
import { manageRosterSchema, teamParamsSchema } from "../team-schemas.server";
import { isTeamFull, isTeamOwner } from "../team-utils";

import "../team.css";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	if (!data) return [];

	return [{ title: makeTitle(data.team.name) }];
};

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUserId(request);

	const { customUrl } = teamParamsSchema.parse(params);
	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));
	validate(
		isTeamOwner({ team, user }) || isAdmin(user),
		"Only team owner can manage roster",
	);

	const data = await parseRequestPayload({
		request,
		schema: manageRosterSchema,
	});

	switch (data._action) {
		case "DELETE_MEMBER": {
			validate(data.userId !== user.id, "Can't delete yourself");
			await TeamRepository.removeTeamMember({
				teamId: team.id,
				userId: data.userId,
			});
			break;
		}
		case "RESET_INVITE_LINK": {
			resetInviteLink(team.id);
			break;
		}
		case "TRANSFER_OWNERSHIP": {
			transferOwnership({
				teamId: team.id,
				newOwnerUserId: data.newOwnerId,
				oldOwnerUserId: user.id,
			});

			throw redirect(teamPage(customUrl));
		}
		case "UPDATE_MEMBER_ROLE": {
			editRole({
				role: data.role || null,
				teamId: team.id,
				userId: data.userId,
			});
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

export const handle: SendouRouteHandle = {
	i18n: ["team"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("t"),
				href: TEAM_SEARCH_PAGE,
				type: "IMAGE",
			},
			{
				text: data.team.name,
				href: teamPage(data.team.customUrl),
				type: "TEXT",
			},
		];
	},
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));

	if (!isTeamOwner({ team, user }) && !isAdmin(user)) {
		throw redirect(teamPage(customUrl));
	}

	return {
		team: { ...team, inviteCode: inviteCodeById(team.id)! },
	};
};

export default function ManageTeamRosterPage() {
	return (
		<Main className="stack lg">
			<InviteCodeSection />
			<MemberActions />
		</Main>
	);
}

function InviteCodeSection() {
	const { t } = useTranslation(["common", "team"]);
	const { team } = useLoaderData<typeof loader>();
	const [, copyToClipboard] = useCopyToClipboard();

	if (isTeamFull(team)) {
		return (
			<Alert variation="INFO" alertClassName="mx-auto w-max">
				{t("team:roster.teamFull")}
			</Alert>
		);
	}

	const inviteLink = `${import.meta.env.VITE_SITE_DOMAIN}${joinTeamPage({
		customUrl: team.customUrl,
		inviteCode: team.inviteCode,
	})}`;

	return (
		<div>
			<h2 className="text-lg">{t("team:roster.inviteLink.header")}</h2>
			<div className="stack md">
				<div className="text-sm" data-testid="invite-link">
					{inviteLink}
				</div>
				<Form method="post" className="stack horizontal md">
					<Button size="tiny" onClick={() => copyToClipboard(inviteLink)}>
						{t("common:actions.copyToClipboard")}
					</Button>
					<SubmitButton
						variant="minimal-destructive"
						_action="RESET_INVITE_LINK"
						size="tiny"
						testId="reset-invite-link-button"
					>
						{t("common:actions.reset")}
					</SubmitButton>
				</Form>
			</div>
		</div>
	);
}

function MemberActions() {
	const { t } = useTranslation(["team"]);
	const { team } = useLoaderData<typeof loader>();

	return (
		<div className="stack md">
			<h2 className="text-lg">{t("team:roster.members.header")}</h2>

			<div className="team__roster__members">
				{team.members.map((member, i) => (
					<MemberRow key={member.id} member={member} number={i} />
				))}
			</div>
		</div>
	);
}

const NO_ROLE = "NO_ROLE";
function MemberRow({
	member,
	number,
}: {
	member: TeamRepository.findByCustomUrl["members"][number];
	number: number;
}) {
	const { team } = useLoaderData<typeof loader>();
	const { t } = useTranslation(["team"]);
	const user = useUser();
	const roleFetcher = useFetcher();

	const isSelf = user!.id === member.id;
	const role = team.members.find((m) => m.id === member.id)?.role ?? NO_ROLE;

	return (
		<React.Fragment key={member.id}>
			<div
				className="team__roster__members__member"
				data-testid={`member-row-${number}`}
			>
				{member.username}
			</div>
			<div>
				<select
					defaultValue={role}
					onChange={(e) =>
						roleFetcher.submit(
							{
								_action: "UPDATE_MEMBER_ROLE",
								userId: String(member.id),
								role: e.target.value === NO_ROLE ? "" : e.target.value,
							},
							{ method: "post" },
						)
					}
					disabled={roleFetcher.state !== "idle"}
					data-testid={`role-select-${number}`}
				>
					<option value={NO_ROLE}>No role</option>
					{TEAM_MEMBER_ROLES.map((role) => {
						return (
							<option key={role} value={role}>
								{t(`team:roles.${role}`)}
							</option>
						);
					})}
				</select>
			</div>
			<div className={clsx({ invisible: isSelf })}>
				<FormWithConfirm
					dialogHeading={t("team:kick.header", {
						teamName: team.name,
						user: member.username,
					})}
					deleteButtonText={t("team:actionButtons.kick")}
					fields={[
						["_action", "DELETE_MEMBER"],
						["userId", member.id],
					]}
				>
					<Button
						size="tiny"
						variant="minimal-destructive"
						testId={!isSelf ? "kick-button" : undefined}
					>
						{t("team:actionButtons.kick")}
					</Button>
				</FormWithConfirm>
			</div>
			<div className={clsx({ invisible: isSelf })}>
				<FormWithConfirm
					dialogHeading={t("team:transferOwnership.header", {
						teamName: team.name,
						user: member.username,
					})}
					deleteButtonText={t("team:actionButtons.transferOwnership.confirm")}
					fields={[
						["_action", "TRANSFER_OWNERSHIP"],
						["newOwnerId", member.id],
					]}
				>
					<Button
						size="tiny"
						variant="minimal-destructive"
						testId={!isSelf ? "transfer-ownership-button" : undefined}
					>
						{t("team:actionButtons.transferOwnership")}
					</Button>
				</FormWithConfirm>
			</div>
			<hr className="team__roster__separator" />
		</React.Fragment>
	);
}
