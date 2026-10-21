import type { Tables } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { AssociationIdentifier } from "../associations-constants";
import type { AssociationVisibility } from "../associations-types";

export type VisibilityRow = Pick<
	Tables["ContentVisibility"],
	"visibleFrom" | "associationId" | "plusTier" | "friendsOfUserId"
> & { isPublic: 0 | 1 };

/**
 * Maps the form shape of an association visibility to `ContentVisibility` rows, one per audience step
 * of the schedule. The base audience applies from `createdAt`, each "not found" step from its `at`.
 * `null` visibility (public) is a single public row, so "is visible" is always "a matching row exists".
 */
export function toRows(
	visibility: AssociationVisibility | null,
	{ createdAt, ownerId }: { createdAt: number; ownerId: number },
): VisibilityRow[] {
	if (!visibility) {
		return [audienceRow({ identifier: null, visibleFrom: createdAt, ownerId })];
	}

	return [
		audienceRow({
			identifier: visibility.forAssociation,
			visibleFrom: createdAt,
			ownerId,
		}),
		...(visibility.notFoundInstructions ?? []).map((instruction) =>
			audienceRow({
				identifier: instruction.forAssociation,
				visibleFrom: instruction.at,
				ownerId,
			}),
		),
	];
}

function audienceRow({
	identifier,
	visibleFrom,
	ownerId,
}: {
	identifier: AssociationIdentifier | null;
	visibleFrom: number;
	ownerId: number;
}): VisibilityRow {
	const row: VisibilityRow = {
		visibleFrom,
		associationId: null,
		plusTier: null,
		friendsOfUserId: null,
		isPublic: 0,
	};

	if (identifier === null) return { ...row, isPublic: 1 };
	if (identifier === "FRIENDS") return { ...row, friendsOfUserId: ownerId };
	if (identifier === "+1") return { ...row, plusTier: 1 };
	if (identifier === "+2") return { ...row, plusTier: 2 };
	if (identifier === "+3") return { ...row, plusTier: 3 };

	return { ...row, associationId: identifier };
}

type FormAssociationIdentifier = AssociationIdentifier | "PUBLIC";

/** Maps the values of the visibility form fields (`baseVisibilityField`, `notFoundVisibilityField`) to the stored shape. */
export function fromForm({
	baseVisibility,
	notFoundVisibility,
}: {
	baseVisibility: FormAssociationIdentifier;
	notFoundVisibility: {
		at?: Date | null;
		forAssociation: FormAssociationIdentifier;
	};
}): AssociationVisibility | null {
	if (baseVisibility === "PUBLIC") return null;

	return {
		forAssociation: baseVisibility,
		notFoundInstructions: notFoundVisibility.at
			? [
					{
						at: dateToDatabaseTimestamp(notFoundVisibility.at),
						forAssociation:
							notFoundVisibility.forAssociation !== "PUBLIC"
								? notFoundVisibility.forAssociation
								: null,
					},
				]
			: undefined,
	};
}
