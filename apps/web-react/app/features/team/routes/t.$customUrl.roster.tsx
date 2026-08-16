import { Check, Clipboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Main } from "~/components/Main";
import { Config } from "~/config";
import { useUser } from "~/features/auth/core/user";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import { joinTeamPage } from "~/features/team/team-urls";
import { SendouForm } from "~/form/SendouForm";
import type { ArrayItemRenderContext } from "~/form/types";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { metaTags } from "~/utils/remix";
import { action } from "../actions/t.$customUrl.roster.server";
import { loader } from "../loaders/t.$customUrl.roster.server";
import {
	CUSTOM_ROLE_VALUE,
	resetInviteLinkSchema,
	updateRosterSchema,
} from "../team-schemas";
import { isTeamFull } from "../team-utils";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Managing team roster",
		location: args.location,
	});
};

export default function ManageTeamRosterPage() {
	const { t } = useTranslation(["team"]);

	return (
		<Main halfWidth className="stack lg">
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
	const { copyToClipboard, copySuccess } = useCopyToClipboard();

	if (isTeamFull(team)) {
		return (
			<Alert variation="INFO" alertClassName="mx-auto w-max">
				{t("team:roster.teamFull")}
			</Alert>
		);
	}

	const inviteLink = `${Config.siteDomain}${joinTeamPage({
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
				<div className="stack horizontal md">
					<SendouButton
						size="small"
						icon={copySuccess ? <Check /> : <Clipboard />}
						onPress={() => copyToClipboard(inviteLink)}
					>
						{t("common:actions.copyToClipboard")}
					</SendouButton>
					<ActionButton
						schema={resetInviteLinkSchema}
						action="RESET_INVITE_LINK"
						variant="minimal-destructive"
						size="small"
						testId="reset-invite-link-button"
					>
						{t("common:actions.reset")}
					</ActionButton>
				</div>
			</div>
		</div>
	);
}

function MemberActions() {
	const { t } = useTranslation(["common", "team"]);
	const { team } = useLoaderData<typeof loader>();
	const user = useUser();

	const isProtectedMember = (member: { id: number; isOwner: number }) =>
		Boolean(member.isOwner) || member.id === user!.id;

	return (
		<div className="stack md">
			<h2 className="text-lg">{t("team:roster.members.header")}</h2>

			<SendouForm
				fullWidth
				schema={updateRosterSchema}
				submitButtonText={t("common:actions.save")}
				defaultValues={{
					members: team.members.map((member) => ({
						userId: member.id,
						role: member.customRole ? CUSTOM_ROLE_VALUE : (member.role ?? null),
						customRole: member.customRole ?? null,
						roleType: member.roleType ?? "PLAYER",
						isManager: Boolean(member.isManager),
					})),
				}}
			>
				{({ FormField }) => (
					<FormField
						name="members"
						canRemoveItem={(item) => {
							const member = team.members.find(
								(m) => m.id === (item as { userId: number }).userId,
							);
							return Boolean(member) && !isProtectedMember(member!);
						}}
					>
						{({ index, itemName, values }: ArrayItemRenderContext) => {
							const member = team.members.find(
								(m) => m.id === (values as { userId: number }).userId,
							);

							return (
								<div
									className="stack md-plus"
									data-testid={`member-row-${index}`}
								>
									<div
										className="stack horizontal sm items-center text-sm font-bold mb-2"
										data-testid={`member-row-username-${index}`}
									>
										{member ? <Avatar size="xs" user={member} /> : null}
										{member?.username}
									</div>
									<FormField name={`${itemName}.role`} />
									{(values as { role: string | null }).role ===
									CUSTOM_ROLE_VALUE ? (
										<>
											<FormField name={`${itemName}.customRole`} />
											<FormField name={`${itemName}.roleType`} />
										</>
									) : null}
									{member && !isProtectedMember(member) ? (
										<FormField name={`${itemName}.isManager`} />
									) : null}
								</div>
							);
						}}
					</FormField>
				)}
			</SendouForm>
		</div>
	);
}
