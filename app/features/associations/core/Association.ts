import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { AssociationIdentifier } from "../associations-constants";
import type { AssociationVisibility } from "../associations-types";

export interface IsVisibleArgs {
	visibility: AssociationVisibility | null;
	time: Date;
	associations: {
		virtual: Array<string>;
		actual: Array<{ id: number }>;
	} | null;
}

export function isVisible(args: IsVisibleArgs) {
	if (!args.visibility) return true;

	const currentVisibility: Array<AssociationIdentifier | null> = [
		args.visibility.forAssociation,
	];

	const dbTime = dateToDatabaseTimestamp(args.time);
	for (const visibility of args.visibility.notFoundInstructions ?? []) {
		if (dbTime > visibility.at) {
			currentVisibility.push(visibility.forAssociation);
		}
	}

	const isPublic = currentVisibility.includes(null);

	if (isPublic) return true;

	return (
		args.associations?.actual.some((association) =>
			currentVisibility.includes(association.id),
		) ||
		args.associations?.virtual.some((association) =>
			currentVisibility.includes(association as any),
		) ||
		false
	);
}

export function isPublic(args: Omit<IsVisibleArgs, "associations">) {
	return isVisible({
		associations: null,
		time: args.time,
		visibility: args.visibility,
	});
}
