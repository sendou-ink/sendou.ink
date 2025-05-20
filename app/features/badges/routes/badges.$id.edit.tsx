import { Form, useMatches, useOutletContext } from "@remix-run/react";
import * as React from "react";
import { Button } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { SendouDialog } from "~/components/elements/Dialog";
import { UserSearch } from "~/components/elements/UserSearch";
import { TrashIcon } from "~/components/icons/Trash";
import type { Tables } from "~/db/tables";
import { useHasPermission, useHasRole } from "~/modules/permissions/hooks";
import { atOrError } from "~/utils/arrays";
import type { BadgeDetailsLoaderData } from "../loaders/badges.$id.server";
import type { BadgeDetailsContext } from "./badges.$id";

import { action } from "../actions/badges.$id.edit.server";
export { action };

export default function EditBadgePage() {
	const isStaff = useHasRole("STAFF");
	const matches = useMatches();
	const data = atOrError(matches, -2).data as BadgeDetailsLoaderData;
	const { badge } = useOutletContext<BadgeDetailsContext>();
	const canManageBadge = useHasPermission(badge, "MANAGE");

	return (
		<SendouDialog
			heading={`Editing winners of ${badge.displayName}`}
			onCloseTo={atOrError(matches, -2).pathname}
			isFullScreen
		>
			<Form method="post" className="stack md">
				{isStaff ? <Managers data={data} /> : null}
				{isStaff && canManageBadge ? <Divider className="mt-2" /> : null}
				{canManageBadge ? <Owners data={data} /> : null}
			</Form>
		</SendouDialog>
	);
}

function Managers({ data }: { data: BadgeDetailsLoaderData }) {
	const [managers, setManagers] = React.useState<
		Array<{ id: number; username: string }>
	>(data.badge.managers);

	const amountOfChanges = managers
		.filter((m) => !data.badge.managers.some((om) => om.id === m.id))
		// maps to id to keep typescript happy
		.map((m) => m.id)
		// needed so we can also list amount of removed managers
		.concat(
			data.badge.managers
				.filter((om) => !managers.some((m) => m.id === om.id))
				.map((m) => m.id),
		).length;

	return (
		<div className="stack md mx-auto">
			<div className="stack sm">
				<h3 className="badges-edit__small-header">Managers</h3>
				<UserSearch
					key={managers.map((m) => m.id).join("-")}
					label="Add new manager"
					className="text-center mx-auto"
					name="new-manager"
					onChange={(user) => {
						if (managers.some((m) => m.id === user.id)) {
							return;
						}

						setManagers([...managers, user]);
					}}
				/>
				<ul className="badges-edit__users-list">
					{managers.map((manager) => (
						<li key={manager.id}>
							{manager.username}
							<Button
								icon={<TrashIcon />}
								variant="minimal-destructive"
								aria-label="Delete badge manager"
								onClick={() =>
									setManagers(managers.filter((m) => m.id !== manager.id))
								}
							/>
						</li>
					))}
				</ul>
			</div>
			<input
				type="hidden"
				name="managerIds"
				value={JSON.stringify(managers.map((m) => m.id))}
			/>
			<div>
				<Button
					type="submit"
					disabled={amountOfChanges === 0}
					name="_action"
					value="MANAGERS"
				>
					{submitButtonText(amountOfChanges)}
				</Button>
			</div>
		</div>
	);

	function submitButtonText(amountOfChanges: number) {
		if (amountOfChanges === 0) return "Submit";
		if (amountOfChanges === 1) return `Submit ${amountOfChanges} change`;

		return `Submit ${amountOfChanges} changes`;
	}
}

function Owners({ data }: { data: BadgeDetailsLoaderData }) {
	const [owners, setOwners] = React.useState(data.badge.owners);

	const ownerDifferences = getOwnerDifferences(owners, data.badge.owners);

	const userInputKey = owners.map((o) => `${o.id}-${o.count}`).join("-");

	return (
		<div className="stack md mx-auto">
			<div className="stack sm">
				<h3 className="badges-edit__small-header">Owners</h3>
				<UserSearch
					label="Add new owner"
					className="text-center mx-auto"
					name="new-owner"
					key={userInputKey}
					onChange={(user) => {
						setOwners((previousOwners) => {
							const existingOwner = previousOwners.find(
								(o) => o.id === user.id,
							);
							if (existingOwner) {
								return previousOwners.map((o) =>
									o.id === user.id ? { ...o, count: o.count + 1 } : o,
								);
							}
							return [...previousOwners, { count: 1, ...user }];
						});
					}}
				/>
			</div>
			<ul className="badges-edit__users-list">
				{owners.map((owner) => (
					<li key={owner.id}>
						{owner.username}
						<input
							className="badges-edit__number-input"
							id="number"
							type="number"
							value={owner.count}
							min={0}
							max={100}
							onChange={(e) =>
								setOwners(
									owners.map((o) =>
										o.id === owner.id
											? { ...o, count: Number(e.target.value) }
											: o,
									),
								)
							}
						/>
					</li>
				))}
			</ul>
			{ownerDifferences.length > 0 ? (
				<ul className="badges-edit__differences">
					{ownerDifferences.map((o) => (
						<li key={o.id}>
							{o.type === "added" ? (
								<>
									{o.difference}{" "}
									<span className="text-success font-semi-bold">added</span> to{" "}
									{o.username}
								</>
							) : (
								<>
									{o.difference}{" "}
									<span className="text-error font-semi-bold">removed</span>{" "}
									from {o.username}
								</>
							)}
						</li>
					))}
				</ul>
			) : null}
			<input
				type="hidden"
				name="ownerIds"
				value={JSON.stringify(countArrayToDuplicatedIdsArray(owners))}
			/>
			<div>
				<Button
					type="submit"
					disabled={ownerDifferences.length === 0}
					name="_action"
					value="OWNERS"
				>
					Submit
				</Button>
			</div>
		</div>
	);
}

function getOwnerDifferences(
	newOwners: BadgeDetailsLoaderData["badge"]["owners"],
	oldOwners: BadgeDetailsLoaderData["badge"]["owners"],
) {
	const result: Array<{
		id: Tables["User"]["id"];
		type: "added" | "removed";
		difference: number;
		username: string;
	}> = [];

	for (const owner of newOwners) {
		const oldOwner = oldOwners.find((o) => o.id === owner.id);
		if (!oldOwner) {
			result.push({
				id: owner.id,
				type: "added",
				difference: owner.count,
				username: owner.username,
			});
			continue;
		}

		if (owner.count !== oldOwner.count) {
			result.push({
				id: owner.id,
				type: owner.count > oldOwner.count ? "added" : "removed",
				difference: Math.abs(owner.count - oldOwner.count),
				username: owner.username,
			});
		}
	}

	return result;
}

function countArrayToDuplicatedIdsArray(
	owners: Array<{ id: Tables["User"]["id"]; count: number }>,
) {
	return owners.flatMap((o) => new Array(o.count).fill(null).map(() => o.id));
}
