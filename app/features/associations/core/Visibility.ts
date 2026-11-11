/**
 * Who sees content limited to an audience (scrim posts, lobbies): an association, friends or a Plus
 * tier, optionally widening at a later time when nobody was found. Stored as `ContentVisibility` rows.
 */
import type { Tables } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type {
	AssociationIdentifier,
	AssociationVirtualIdentifier,
} from "../associations-constants";
import type { AssociationVisibility } from "../associations-types";

/** A `ContentVisibility` row without the entity it is about. */
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

/**
 * Maps stored `ContentVisibility` rows, in the order they come into effect, back to the values of the
 * visibility form fields: the inverse of `toRows` after `fromForm`. The "not found" step's `at` is a database
 * timestamp. Rows of content seen only through its share link (none) can't be told apart here.
 */
export function toForm(rows: VisibilityRow[]): {
	baseVisibility: FormAssociationIdentifier;
	notFoundVisibility: {
		at: number | null;
		forAssociation: FormAssociationIdentifier;
	};
} {
	const [base, notFound] = rows;

	return {
		baseVisibility: base ? identifierOf(base) : "PUBLIC",
		notFoundVisibility: notFound
			? { at: notFound.visibleFrom, forAssociation: identifierOf(notFound) }
			: { at: null, forAssociation: "PUBLIC" },
	};
}

/**
 * Issues of the visibility form fields compared to each other and to when the content starts: the "not found"
 * audience has to differ from the base one, can't be set for public (or link only) content and has to come into
 * effect before the start. Content being made can't have one if it starts right away, content being edited
 * (`isEdit`) can as its "not found" audience may already be in effect. `messages` are the translation keys of the
 * last two, worded for scrim posts by default.
 */
export function formIssues(
	values: {
		baseVisibility: FormAssociationIdentifier | "LINK_ONLY";
		notFoundVisibility: {
			at?: Date | null;
			forAssociation: FormAssociationIdentifier;
		};
	},
	{
		startsAt,
		isEdit = false,
		messages = {
			afterStart: "forms:errors.dateAfterScrimDate",
			startingNow: "forms:errors.canNotSetIfLookingNow",
		},
	}: {
		startsAt: Date;
		isEdit?: boolean;
		messages?: { afterStart: string; startingNow: string };
	},
): Array<{ path: ["notFoundVisibility"]; message: string }> {
	const issue = (message: string) => ({
		path: ["notFoundVisibility"] as ["notFoundVisibility"],
		message,
	});
	const issues: Array<ReturnType<typeof issue>> = [];

	const { at, forAssociation } = values.notFoundVisibility;

	if (at && forAssociation === values.baseVisibility) {
		issues.push(issue("forms:errors.visibilityMustBeDifferent"));
	}

	if (
		(values.baseVisibility === "PUBLIC" ||
			values.baseVisibility === "LINK_ONLY") &&
		at
	) {
		issues.push(issue("forms:errors.visibilityNotAllowedWhenPublic"));
	}

	if (at && at > startsAt) {
		issues.push(issue(messages.afterStart));
	}

	if (at && !isEdit && startsAt < new Date()) {
		issues.push(issue(messages.startingNow));
	}

	return issues;
}

/**
 * The associations the user can limit content to plus the ones its rows already limit it to, so a form editing
 * them shows the current audience even if the user isn't (anymore) a member of it.
 */
export function withAudiencesOf(
	associations: {
		virtual: AssociationVirtualIdentifier[];
		actual: Array<{ id: number; name: string }>;
	},
	rows: Array<VisibilityRow & { associationName: string | null }>,
) {
	const virtual = [...associations.virtual];
	const actual = [...associations.actual];

	for (const row of rows) {
		const identifier = identifierOf(row);
		if (identifier === "PUBLIC") continue;

		if (typeof identifier === "number") {
			if (!actual.some((association) => association.id === identifier)) {
				actual.push({ id: identifier, name: row.associationName ?? "" });
			}
		} else if (!virtual.includes(identifier)) {
			virtual.push(identifier);
		}
	}

	return { virtual, actual };
}

function identifierOf(row: VisibilityRow): FormAssociationIdentifier {
	if (row.associationId !== null) return row.associationId;
	if (row.friendsOfUserId !== null) return "FRIENDS";
	if (row.plusTier === 1) return "+1";
	if (row.plusTier === 2) return "+2";
	if (row.plusTier === 3) return "+3";

	return "PUBLIC";
}
