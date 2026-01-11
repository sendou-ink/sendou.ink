import { Trash } from "lucide-react";
import * as React from "react";
import { Form, useMatches, useOutletContext } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { UserSearch } from "~/components/elements/UserSearch";
import type { Tables } from "~/db/tables";
import { useHasPermission, useHasRole } from "~/modules/permissions/hooks";
import { action } from "../actions/badges.$id.edit.server";
import styles from "../badges.module.css";
import type { BadgeDetailsLoaderData } from "../loaders/badges.$id.server";
import type { BadgeDetailsContext } from "./badges.$id";
export { action };

export default function EditBadgePage() {
	const isStaff = useHasRole("STAFF");
	const matches = useMatches();
	const parentMatch = matches.at(-2)!;
	const data = parentMatch.data as BadgeDetailsLoaderData;
	const { badge } = useOutletContext<BadgeDetailsContext>();
	const canManageBadge = useHasPermission(badge, "MANAGE");

	return (
		<SendouDialog
			heading={`Editing winners of ${badge.displayName}`}
			onCloseTo={parentMatch.pathname}
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
	const [managers, setManagers] = React.useState(
		data.badge.managers.map((m) => ({ id: m.id, name: m.username })),
	);

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
				<h3 className={styles.editSmallHeader}>Managers</h3>
				<UserSearch
					key={managers.map((m) => m.id).join("-")}
					label="Add new manager"
					className="text-center mx-auto"
					name="new-manager"
					onChange={(user) => {
						if (!user) return;
						if (managers.some((m) => m.id === user.id)) {
							return;
						}

						setManagers([...managers, user]);
					}}
				/>
				<ul className={styles.editUsersList}>
					{managers.map((manager) => (
						<li key={manager.id}>
							{manager.name}
							<SendouButton
								shape="circle"
								size="small"
								icon={<Trash />}
								variant="minimal-destructive"
								aria-label="Delete badge manager"
								onPress={() =>
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
				<SendouButton
					type="submit"
					isDisabled={amountOfChanges === 0}
					name="_action"
					value="MANAGERS"
				>
					{submitButtonText(amountOfChanges)}
				</SendouButton>
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
	const initialOwners = data.badge.owners.map((o) => ({
		id: o.id,
		name: o.username,
		discordId: o.discordId,
		count: o.count,
	}));
	const [owners, setOwners] =
		React.useState<
			Array<{ id: number; name: string; discordId: string; count: number }>
		>(initialOwners);

	const ownerDifferences = getOwnerDifferences(
		owners.map((o) => ({ ...o, username: o.name })),
		data.badge.owners,
	);

	const userInputKey = owners.map((o) => `${o.id}-${o.count}`).join("-");

	return (
		<div className="stack md mx-auto">
			<div className="stack sm">
				<h3 className={styles.editSmallHeader}>Owners</h3>
				<UserSearch
					label="Add new owner"
					className="text-center mx-auto"
					name="new-owner"
					key={userInputKey}
					onChange={(user) => {
						if (!user) return;
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
			<ul className={styles.editUsersList}>
				{owners.map((owner) => (
					<li key={owner.id}>
						{owner.name}
						<input
							className={styles.editNumberInput}
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
				<ul className={styles.editDifferences}>
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
				<SendouButton
					type="submit"
					isDisabled={ownerDifferences.length === 0}
					name="_action"
					value="OWNERS"
				>
					Submit
				</SendouButton>
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
