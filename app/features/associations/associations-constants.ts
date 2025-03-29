export const ASSOCIATION = {
	VIRTUAL_IDENTIFIERS: ["+1", "+2", "+3"] as const,
};

export type AssociationVirtualIdentifier =
	(typeof ASSOCIATION)["VIRTUAL_IDENTIFIERS"][number];

/** If number, an actual association id and if string then a virtual identifier */
export type AssociationIdentifier = number | AssociationVirtualIdentifier;
