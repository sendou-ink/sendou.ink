import type { getAssociations } from "./associations.remote.ts";

export type AssociationsPageAssociation = Awaited<
	ReturnType<typeof getAssociations>
>[number];

export type AssociationsPageMember = NonNullable<
	AssociationsPageAssociation["members"]
>[number];

export type Viewer = { id: number } | undefined;
