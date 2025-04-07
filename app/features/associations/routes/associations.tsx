import { Link, Outlet, useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useCopyToClipboard } from "react-use";
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
import { useHasPermission } from "~/modules/permissions/useHasPermission";
import { associationsPage, userPage } from "~/utils/urls";

import { action } from "~/features/associations/actions/associations.server";
import {
	type AssociationsLoaderData,
	loader,
} from "~/features/associations/loaders/associations.server";
export { loader, action };

export default function AssociationsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<Outlet />
			<Header />
			<JoinForm />
			{data.associations.map((association) => (
				<Association key={association.id} association={association} />
			))}
		</Main>
	);
}

function Header() {
	return (
		<div>
			<h1 className="text-xl">Associations</h1>
			<div className="text-sm text-lighter">
				Create an association to look in a smaller group (for example make one
				with your team's regular practice opponents or LUTI division).
			</div>
		</div>
	);
}

function JoinForm() {
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();

	if (!data.toJoin) return null;

	return (
		<fetcher.Form method="post" className="stack horizontal md items-center">
			<input type="hidden" name="inviteCode" value={data.toJoin.inviteCode} />
			<Label spaced={false}>Join {data.toJoin.association.name}?</Label>
			<SubmitButton
				size="tiny"
				_action="JOIN_ASSOCIATION"
				state={fetcher.state}
			>
				Join
			</SubmitButton>
		</fetcher.Form>
	);
}

function Association({
	association,
}: { association: AssociationsLoaderData["associations"][number] }) {
	const user = useUser();
	const canManage = useHasPermission(association, "MANAGE");

	return (
		<section>
			<div className="stack horizontal sm">
				<h2 className="text-lg"> {association.name}</h2>
				{canManage ? (
					<FormWithConfirm
						dialogHeading={`Delete ${association.name} association?`}
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
						/>
					</FormWithConfirm>
				) : null}
			</div>
			<div className="text-sm text-lighter">
				Admin: {association.members?.find((m) => m.role === "ADMIN")?.username}
			</div>
			{!canManage ? (
				<FormWithConfirm
					dialogHeading={`Leave ${association.name} association?`}
					fields={[
						["_action", "LEAVE_ASSOCIATION"],
						["associationId", association.id],
					]}
					submitButtonText="Leave"
				>
					<SendouButton
						variant="minimal-destructive"
						type="submit"
						size="small"
						className="my-2"
					>
						Leave
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
			<label htmlFor="invite">Share link to add members</label>
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
					Reset link
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
					dialogHeading={`Remove ${member.username} from the association?`}
					submitButtonText="Remove"
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
