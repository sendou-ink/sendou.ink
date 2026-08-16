import type { AssociationIdentifier } from "./associations-constants";

export interface AssociationVisibility {
	/** Which association should see it */
	forAssociation: AssociationIdentifier;
	notFoundInstructions?: Array<{
		/** When to expand the visibility */
		at: number;
		/** To which association expand the visibility to? null indicates public */
		forAssociation: AssociationIdentifier | null;
	}>;
}
