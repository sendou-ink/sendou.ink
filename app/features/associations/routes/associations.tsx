import { Check, Clipboard, Star, Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type MetaFunction, Outlet, useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { UserLink } from "~/components/UserLink";
import { action } from "~/features/associations/actions/associations.server";
import { associationsPage } from "~/features/associations/associations-urls";
import * as Association from "~/features/associations/core/Association";
import {
	type AssociationsLoaderData,
	loader,
} from "~/features/associations/loaders/associations.server";
import { useUser } from "~/features/auth/core/user";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useHasPermission } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { associationsPageActionSchema } from "../associations-schemas";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Associations",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "scrims",
};

export default function AssociationsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<Outlet />
			<div className="stack sm">
				<Header />
			</div>
			<JoinForm />
			{data.associations.map((association) => (
				<AssociationSection key={association.id} association={association} />
			))}
		</Main>
	);
}

function Header() {
	const { t } = useTranslation(["scrims"]);

	return (
		<div>
			<h1 className="text-xl">{t("scrims:associations.title")}</h1>
			<div className="text-sm text-lighter">
				{t("scrims:associations.explanation")}
			</div>
		</div>
	);
}

function JoinForm() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "scrims"]);

	if (!data.toJoin) return null;

	return (
		<div className="stack horizontal md items-center">
			<Label spaced={false}>
				{t("scrims:associations.join.title", {
					name: data.toJoin.association.name,
				})}
			</Label>
			<ActionButton
				schema={associationsPageActionSchema}
				action="JOIN_ASSOCIATION"
				fields={{ inviteCode: data.toJoin.inviteCode }}
				size="small"
			>
				{t("common:actions.join")}
			</ActionButton>
		</div>
	);
}

function AssociationSection({
	association,
}: {
	association: AssociationsLoaderData["associations"][number];
}) {
	const { t } = useTranslation(["common", "scrims"]);
	const user = useUser();
	const canManage = useHasPermission(association, "MANAGE");
	const newAdmin = canManage
		? Association.resolveNewAdmin(association.members ?? [])
		: null;

	return (
		<section>
			<div className="stack horizontal sm items-center justify-between">
				<h2 className="text-lg"> {association.name}</h2>
				{canManage ? (
					<FormWithConfirm
						dialogHeading={t("scrims:associations.delete.title", {
							name: association.name,
						})}
						fields={[
							["associationId", association.id],
							["_action", "DELETE_ASSOCIATION"],
						]}
					>
						<SendouButton
							shape="square"
							icon={<Trash className="small-icon" />}
							className="small-text"
							variant="minimal-destructive"
							type="submit"
							data-testid="delete-association"
						/>
					</FormWithConfirm>
				) : null}
			</div>
			<div className="text-sm text-lighter">
				{t("scrims:associations.admin", {
					username: association.members?.find((m) => m.role === "ADMIN")
						?.username,
				})}
			</div>
			{!canManage || newAdmin ? (
				<FormWithConfirm
					dialogHeading={
						newAdmin
							? t("scrims:associations.leave.titleWithNewAdmin", {
									name: association.name,
									username: newAdmin.username,
								})
							: t("scrims:associations.leave.title", {
									name: association.name,
								})
					}
					fields={[
						["_action", "LEAVE_ASSOCIATION"],
						["associationId", association.id],
					]}
					submitButtonText={t("scrims:associations.leave.action")}
				>
					<SendouButton
						variant="minimal-destructive"
						type="submit"
						size="small"
						className="my-2"
						data-testid="leave-team-button"
					>
						{t("scrims:associations.leave.action")}
					</SendouButton>
				</FormWithConfirm>
			) : null}
			<div className="stack sm mt-4">
				{association.members?.map((member) => (
					<AssociationMember
						key={member.id}
						member={member}
						associationId={association.id}
						showControls={canManage && member.id !== user?.id}
					/>
				))}
			</div>
			{canManage ? (
				<div className="text-xs text-lighter mt-2">
					{t("scrims:associations.manager.explanation")}
				</div>
			) : null}
			{association.inviteCode ? (
				<AssociationInviteCodeActions
					associationId={association.id}
					inviteCode={association.inviteCode}
					canResetLink={canManage}
				/>
			) : null}
		</section>
	);
}

function AssociationInviteCodeActions({
	associationId,
	inviteCode,
	canResetLink,
}: {
	associationId: number;
	inviteCode: string;
	canResetLink: boolean;
}) {
	const { t } = useTranslation(["common", "scrims"]);
	const { copyToClipboard, copySuccess } = useCopyToClipboard();
	const id = React.useId();

	const inviteLink = `https://sendou.ink${associationsPage(inviteCode)}`;

	return (
		<div className="mt-6">
			<label htmlFor={id}>{t("scrims:associations.shareLink.title")}</label>
			<div className="stack horizontal sm items-center">
				<input type="text" value={inviteLink} readOnly id={id} />
				<SendouButton
					shape="square"
					variant={copySuccess ? "outlined-success" : "outlined"}
					onClick={() => copyToClipboard(inviteLink)}
					icon={copySuccess ? <Check /> : <Clipboard />}
					aria-label="Copy to clipboard"
				/>
			</div>
			{canResetLink ? (
				<ActionButton
					schema={associationsPageActionSchema}
					action="REFRESH_INVITE_CODE"
					fields={{ associationId }}
					variant="minimal-destructive"
					size="small"
				>
					{t("scrims:associations.shareLink.reset")}
				</ActionButton>
			) : null}
		</div>
	);
}

function AssociationMember({
	member,
	associationId,
	showControls,
}: {
	member: NonNullable<
		AssociationsLoaderData["associations"][number]["members"]
	>[number];
	associationId: number;
	showControls?: boolean;
}) {
	const { t } = useTranslation(["common", "scrims"]);

	return (
		<div className="stack horizontal sm items-center justify-between">
			<div className="stack horizontal sm items-center">
				<UserLink user={member} />
				{!showControls && member.role === "MANAGER" ? (
					<Star
						className="small-icon"
						fill="currentColor"
						role="img"
						aria-label={t("scrims:associations.manager.label")}
					/>
				) : null}
			</div>
			{showControls ? (
				<div className="stack horizontal sm items-center">
					<ActionButton
						schema={associationsPageActionSchema}
						action={
							member.role === "MANAGER" ? "REMOVE_MANAGER" : "ADD_MANAGER"
						}
						fields={{ userId: member.id, associationId }}
						shape="square"
						variant="minimal"
						size="small"
						className="small-text"
						icon={
							<Star
								className="small-icon"
								fill={member.role === "MANAGER" ? "currentColor" : "none"}
							/>
						}
						aria-label={t(
							member.role === "MANAGER"
								? "scrims:associations.manager.remove"
								: "scrims:associations.manager.add",
							{ username: member.username },
						)}
					/>
					<FormWithConfirm
						dialogHeading={t("scrims:associations.removeMember.title", {
							username: member.username,
						})}
						submitButtonText={t("common:actions.remove")}
						fields={[
							["userId", member.id],
							["associationId", associationId],
							["_action", "REMOVE_MEMBER"],
						]}
					>
						<SendouButton
							shape="square"
							icon={<Trash className="small-icon" />}
							className="small-text"
							variant="minimal-destructive"
							size="small"
							type="submit"
						/>
					</FormWithConfirm>
				</div>
			) : null}
		</div>
	);
}
