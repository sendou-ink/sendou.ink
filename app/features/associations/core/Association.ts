import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { AssociationIdentifier } from "../associations-constants";
import type { AssociationVisibility } from "../associations-types";

export interface IsVisibleArgs {
	visibility: AssociationVisibility | null;
	time?: Date;
	associations: {
		virtual: Array<string>;
		actual: Array<{ id: number }>;
		friendIds?: Array<number>;
	} | null;
	contentOwnerUserId?: number;
}

export function isVisible(args: IsVisibleArgs) {
	if (!args.visibility) return true;

	const currentVisibility: Array<AssociationIdentifier | null> = [
		args.visibility.forAssociation,
	];

	const dbTime = dateToDatabaseTimestamp(args.time ?? new Date());
	for (const visibility of args.visibility.notFoundInstructions ?? []) {
		if (dbTime > visibility.at) {
			currentVisibility.push(visibility.forAssociation);
		}
	}

	const visibleToEveryone = currentVisibility.includes(null);

	if (visibleToEveryone) return true;

	if (
		currentVisibility.includes("FRIENDS") &&
		args.contentOwnerUserId &&
		args.associations?.friendIds?.includes(args.contentOwnerUserId)
	) {
		return true;
	}

	return (
		args.associations?.actual.some((association) =>
			currentVisibility.includes(association.id),
		) ||
		args.associations?.virtual.some(
			(association) =>
				// "FRIENDS" is a sentinel every user has, handled by the friendship check above
				association !== "FRIENDS" &&
				currentVisibility.includes(association as any),
		) ||
		false
	);
}

/** Whether the association is in the visibility at any point of its schedule, not only right now. */
export function mentionsAssociation({
	visibility,
	associationId,
}: {
	visibility: AssociationVisibility | null;
	associationId: number;
}) {
	if (!visibility) return false;

	return (
		visibility.forAssociation === associationId ||
		(visibility.notFoundInstructions ?? []).some(
			(instruction) => instruction.forAssociation === associationId,
		)
	);
}

export function isPublic(args: Omit<IsVisibleArgs, "associations">) {
	return isVisible({
		associations: null,
		time: args.time,
		visibility: args.visibility,
	});
}

/**
 * Who becomes the admin after the current one leaves. `null` if no manager can take over,
 * in which case the admin can't leave. Of several managers the one with the lowest user id
 * (the oldest account) is picked, same as team ownership passing on.
 */
export function resolveNewAdmin<T extends { id: number; role: string }>(
	members: Array<T>,
) {
	const managers = members.filter((member) => member.role === "MANAGER");

	return managers.sort((a, b) => a.id - b.id).at(0) ?? null;
}
