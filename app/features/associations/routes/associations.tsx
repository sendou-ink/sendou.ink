import { Link, Outlet, useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { AddNewButton } from "~/components/AddNewButton";
import { Avatar } from "~/components/Avatar";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouButton } from "~/components/elements/Button";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { ClipboardIcon } from "~/components/icons/Clipboard";
import { TrashIcon } from "~/components/icons/Trash";
import { useUser } from "~/features/auth/core/user";
import { useHasPermission } from "~/modules/permissions/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { associationsPage, newAssociationsPage, userPage } from "~/utils/urls";

import { action } from "~/features/associations/actions/associations.server";
import {
	type AssociationsLoaderData,
	loader,
} from "~/features/associations/loaders/associations.server";
export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: "scrims",
};

export default function AssociationsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<Outlet />
			<div className="stack sm">
				<div className="stack items-end">
					<AddNewButton to={newAssociationsPage()} navIcon="associations" />
				</div>
				<Header />
			</div>
			<JoinForm />
			{data.associations.map((association) => (
				<Association key={association.id} association={association} />
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
	const fetcher = useFetcher();
	const { t } = useTranslation(["common", "scrims"]);

	if (!data.toJoin) return null;

	return (
		<fetcher.Form method="post" className="stack horizontal md items-center">
			<input type="hidden" name="inviteCode" value={data.toJoin.inviteCode} />
			<Label spaced={false}>
				{t("scrims:associations.join.title", {
					name: data.toJoin.association.name,
				})}
			</Label>
			<SubmitButton
				size="tiny"
				_action="JOIN_ASSOCIATION"
				state={fetcher.state}
			>
				{t("common:actions.join")}
			</SubmitButton>
		</fetcher.Form>
	);
}

function Association({
	association,
}: { association: AssociationsLoaderData["associations"][number] }) {
	const { t } = useTranslation(["common", "scrims"]);
	const user = useUser();
	const canManage = useHasPermission(association, "MANAGE");

	return (
		<section>
			<div className="stack horizontal sm">
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
							icon={<TrashIcon className="build__icon" />}
							className="build__small-text"
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
			{!canManage ? (
				<FormWithConfirm
					dialogHeading={t("scrims:associations.leave.title", {
						name: association.name,
					})}
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
			{association.inviteCode ? (
				<AssociationInviteCodeActions
					associationId={association.id}
					inviteCode={association.inviteCode}
				/>
			) : null}
		</section>
	);
}

function AssociationInviteCodeActions({
	associationId,
	inviteCode,
}: { associationId: number; inviteCode: string }) {
	const { t } = useTranslation(["common", "scrims"]);
	const [state, copyToClipboard] = useCopyToClipboard();
	const [copySuccess, setCopySuccess] = React.useState(false);
	const fetcher = useFetcher();

	React.useEffect(() => {
		if (!state.value) return;

		setCopySuccess(true);
		const timeout = setTimeout(() => setCopySuccess(false), 2000);

		return () => clearTimeout(timeout);
	}, [state]);

	const inviteLink = `https://sendou.ink${associationsPage(inviteCode)}`;

	return (
		<div className="mt-6">
			<label htmlFor="invite">{t("scrims:associations.shareLink.title")}</label>
			<div className="stack horizontal sm items-center">
				<input type="text" value={inviteLink} readOnly id="invite" />
				<SendouButton
					variant={copySuccess ? "outlined-success" : "outlined"}
					onPress={() => copyToClipboard(inviteLink)}
					icon={copySuccess ? <CheckmarkIcon /> : <ClipboardIcon />}
					aria-label="Copy to clipboard"
				/>
			</div>
			<fetcher.Form method="post">
				<input type="hidden" name="associationId" value={associationId} />
				<SubmitButton
					variant="minimal-destructive"
					size="tiny"
					className="mt-4"
					_action="REFRESH_INVITE_CODE"
					state={fetcher.state}
				>
					{t("scrims:associations.shareLink.reset")}
				</SubmitButton>
			</fetcher.Form>
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
		<div className="stack horizontal sm">
			<Link
				to={userPage(member)}
				className="text-main-forced stack horizontal sm"
			>
				<Avatar size="xxs" user={member} />
				{member.username}
			</Link>
			{showControls ? (
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
						icon={<TrashIcon className="build__icon" />}
						className="build__small-text"
						variant="minimal-destructive"
						type="submit"
					/>
				</FormWithConfirm>
			) : null}
		</div>
	);
}
