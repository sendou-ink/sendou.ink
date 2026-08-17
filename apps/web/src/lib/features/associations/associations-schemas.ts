import * as v from "valibot";
import { id } from "#lib/utils/schemas.ts";
import { ASSOCIATION } from "./associations-types.ts";

const virtualAssociationIdentifierSchema = v.picklist(
	ASSOCIATION.VIRTUAL_IDENTIFIERS,
);

export const associationIdentifierSchema = v.union([
	virtualAssociationIdentifierSchema,
	id,
	v.literal("PUBLIC"), // null in DB
]);
