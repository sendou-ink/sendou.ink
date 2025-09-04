import type { MetaFunction } from "@remix-run/node";
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { TrashIcon } from "~/components/icons/Trash";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { joinTeamPage } from "~/utils/urls";
import type * as TeamRepository from "../TeamRepository.server";
import { TEAM_MEMBER_ROLES } from "../team-constants";
import { isTeamFull } from "../team-utils";
import "../team.css";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import { metaTags } from "~/utils/remix";

import { action } from "../actions/t.$customUrl.roster.server";
import { loader } from "../loaders/t.$customUrl.roster.server";
export { loader, action };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Managing team roster",
		location: args.location,
	});
};

export default function ManageTeamRosterPage() {
	const { t } = useTranslation(["team"]);

	return (
		<Main className="stack lg">
			<TeamGoBackButton />
			<InviteCodeSection />
			<MemberActions />
			<SendouPopover
				trigger={
					<SendouButton
						className="self-start italic"
						size="small"
						variant="minimal"
					>
						{t("team:editorsInfo.button")}
					</SendouButton>
				}
			>
				{t("team:editorsInfo.popover")}
			</SendouPopover>
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
		inviteCode: team.inviteCode!,
	})}`;

	return (
		<div>
			<h2 className="text-lg">{t("team:roster.inviteLink.header")}</h2>
			<div className="stack md">
				<div className="text-sm" data-testid="invite-link">
					{inviteLink}
				</div>
				<Form method="post" className="stack horizontal md">
					<SendouButton
						size="small"
						onPress={() => copyToClipboard(inviteLink)}
					>
						{t("common:actions.copyToClipboard")}
					</SendouButton>
					<SubmitButton
						variant="minimal-destructive"
						_action="RESET_INVITE_LINK"
						size="small"
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
	const editorFetcher = useFetcher();

	const isSelf = user!.id === member.id;
	const role = team.members.find((m) => m.id === member.id)?.role ?? NO_ROLE;

	const isThisMemberOwner = Boolean(
		team.members.find((m) => m.id === member.id)?.isOwner,
	);
	const isThisMemberManager = Boolean(
		team.members.find((m) => m.id === member.id)?.isManager,
	);

	const editorIsBeingAdded =
		editorFetcher.formData?.get("_action") === "ADD_MANAGER";
	const editorIsBeingRemoved =
		editorFetcher.formData?.get("_action") === "REMOVE_MANAGER";

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
			<div className={clsx({ invisible: isThisMemberOwner || isSelf })}>
				<SendouSwitch
					onChange={(isSelected) =>
						editorFetcher.submit(
							{
								_action: isSelected ? "ADD_MANAGER" : "REMOVE_MANAGER",
								userId: String(member.id),
							},
							{ method: "post" },
						)
					}
					isSelected={
						editorIsBeingAdded
							? true
							: editorIsBeingRemoved
								? false
								: isThisMemberManager
					}
					data-testid="editor-switch"
				>
					{t("team:editor.label")}
				</SendouSwitch>
			</div>
			<div className={clsx({ invisible: isThisMemberOwner || isSelf })}>
				<FormWithConfirm
					dialogHeading={t("team:kick.header", {
						teamName: team.name,
						user: member.username,
					})}
					submitButtonText={t("team:actionButtons.kick")}
					fields={[
						["_action", "DELETE_MEMBER"],
						["userId", member.id],
					]}
				>
					<SendouButton
						size="small"
						variant="destructive"
						icon={<TrashIcon />}
						data-testid={!isSelf ? "kick-button" : undefined}
					>
						{t("team:actionButtons.kick")}
					</SendouButton>
				</FormWithConfirm>
			</div>
			<hr className="team__roster__separator" />
		</React.Fragment>
	);
}
