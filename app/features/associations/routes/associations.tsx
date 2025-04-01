import { Link, Outlet, useLoaderData } from "@remix-run/react";
import { Avatar } from "~/components/Avatar";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Main } from "~/components/Main";
import { SendouButton } from "~/components/elements/Button";
import { TrashIcon } from "~/components/icons/Trash";
import { useUser } from "~/features/auth/core/user";
import { useHasPermission } from "~/modules/permissions/useHasPermission";
import { userPage } from "~/utils/urls";

import { action } from "~/features/associations/actions/associations.server";
import {
	type AssociationsLoaderData,
	loader,
} from "~/features/associations/loaders/associations.server";
export { loader, action };

// xxx: invite via link
// xxx: regenerate link

export default function AssociationsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<Outlet />
			<Header />
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
		</section>
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
