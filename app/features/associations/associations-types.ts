import type { AssociationIdentifier } from "./associations-constants";

export interface AssociationVisibility {
	forAssociation: AssociationIdentifier;
	notFoundInstructions?: Array<{
		at: number;
		/** null = public */
		forAssociation: AssociationIdentifier | null;
	}>;
}
