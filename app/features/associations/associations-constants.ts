export const ASSOCIATION = {
	VIRTUAL_IDENTIFIERS: ["+1", "+2", "+3"] as const,
	MAX_COUNT_REGULAR_USER: 3,
	MAX_COUNT_SUPPORTER: 6,
	MAX_ASSOCIATION_MEMBER_COUNT: 300,
};

export type AssociationVirtualIdentifier =
	(typeof ASSOCIATION)["VIRTUAL_IDENTIFIERS"][number];

/** If number, an actual association id and if string then a virtual identifier */
export type AssociationIdentifier = number | AssociationVirtualIdentifier;
