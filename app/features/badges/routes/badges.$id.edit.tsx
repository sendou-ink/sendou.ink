import { Form, useMatches, useOutletContext } from "@remix-run/react";
import * as React from "react";
import { Button, LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Label } from "~/components/Label";
import { UserSearch } from "~/components/UserSearch";
import { TrashIcon } from "~/components/icons/Trash";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useHasRole } from "~/modules/permissions/hooks";
import { canEditBadgeOwners } from "~/permissions";
import { atOrError } from "~/utils/arrays";
import type * as BadgeRepository from "../BadgeRepository.server";
import type { BadgeDetailsLoaderData } from "../loaders/badges.$id.server";
import type { BadgeDetailsContext } from "./badges.$id";

import { action } from "../actions/badges.$id.edit.server";
export { action };

export default function EditBadgePage() {
	const user = useUser();
	const isStaff = useHasRole("STAFF");
	const matches = useMatches();
	const data = atOrError(matches, -2).data as BadgeDetailsLoaderData;
	const { badgeName } = useOutletContext<BadgeDetailsContext>();

	return (
		<Dialog isOpen>
			<Form method="post" className="stack md">
				<div>
					<h2 className="badges-edit__big-header">
						Editing winners of {badgeName}
					</h2>
					<LinkButton
						to={atOrError(matches, -2).pathname}
						variant="minimal-destructive"
						size="tiny"
						className="badges-edit__cancel-button"
					>
						Cancel
					</LinkButton>
				</div>

				{isStaff ? <Managers data={data} /> : null}
				{canEditBadgeOwners({ user, managers: data.managers }) ? (
					<Owners data={data} />
				) : null}
			</Form>
		</Dialog>
	);
}

function Managers({ data }: { data: BadgeDetailsLoaderData }) {
	const [managers, setManagers] = React.useState(data.managers);

	const amountOfChanges = managers
		.filter((m) => !data.managers.some((om) => om.id === m.id))
		// maps to id to keep typescript happy
		.map((m) => m.id)
		// needed so we can also list amount of removed managers
		.concat(
			data.managers
				.filter((om) => !managers.some((m) => m.id === om.id))
				.map((m) => m.id),
		).length;

	const userIdsToOmitFromCombobox = React.useMemo(() => {
		return new Set(data.managers.map((m) => m.id));
	}, [data]);

	return (
		<div className="stack md">
			<div className="stack sm">
				<h3 className="badges-edit__small-header">Managers</h3>
				<div className="text-center my-4">
					<Label
						className="stack vertical items-center"
						htmlFor="add-new-manager"
					>
						Add new manager
					</Label>
					<UserSearch
						id="add-new-manager"
						className="mx-auto"
						inputName="new-manager"
						onChange={(user) => {
							setManagers([...managers, user]);
						}}
						userIdsToOmit={userIdsToOmitFromCombobox}
					/>
				</div>
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
			<Button
				type="submit"
				size="tiny"
				className="badges-edit__submit-button"
				disabled={amountOfChanges === 0}
				name="_action"
				value="MANAGERS"
			>
				{submitButtonText(amountOfChanges)}
			</Button>
		</div>
	);

	function submitButtonText(amountOfChanges: number) {
		if (amountOfChanges === 0) return "Submit";
		if (amountOfChanges === 1) return `Submit ${amountOfChanges} change`;

		return `Submit ${amountOfChanges} changes`;
	}
}

function Owners({ data }: { data: BadgeDetailsLoaderData }) {
	const [owners, setOwners] = React.useState(data.owners);

	const ownerDifferences = getOwnerDifferences(owners, data.owners);

	const userInputKey = owners.map((o) => `${o.id}-${o.count}`).join("-");

	return (
		<div className="stack md">
			<div className="stack sm">
				<h3 className="badges-edit__small-header">Owners</h3>
				<div className="text-center my-4">
					<Label className="stack items-center" htmlFor="add-new-owner">
						Add new owner
					</Label>
					<UserSearch
						id="add-new-owner"
						className="mx-auto"
						inputName="new-owner"
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
			<Button
				type="submit"
				size="tiny"
				className="badges-edit__submit-button"
				disabled={ownerDifferences.length === 0}
				name="_action"
				value="OWNERS"
			>
				Save
			</Button>
		</div>
	);
}

function getOwnerDifferences(
	newOwners: BadgeRepository.FindOwnersByBadgeIdItem[],
	oldOwners: BadgeRepository.FindOwnersByBadgeIdItem[],
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
