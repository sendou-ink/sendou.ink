import type { Tables } from "~/db/tables";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";

type Member = {
	userId: number;
	role: Tables["TournamentOrganizationMember"]["role"];
};

type UpdateArgs = Parameters<typeof TournamentOrganizationRepository.update>[0];

type Options = {
	/** Members besides the owner, who is an admin of the organization regardless. */
	members?: Array<Member>;
	isEstablished?: boolean;
	description?: string | null;
	socials?: string[] | null;
	series?: UpdateArgs["series"];
};

/**
 * Creates tournament organizations. `ownerId` is who owns it, added as its admin by
 * the repository. Slug follows from the name, as it does in production.
 */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		name: `Organization ${seq}`,
	}),
	insert: TournamentOrganizationRepository.insert,
	applyOptions: async (
		org,
		{ members, isEstablished, description, socials, series }: Options,
	) => {
		if (isEstablished) {
			await TournamentOrganizationRepository.updateIsEstablished(org.id, true);
		}

		if (members || description !== undefined || socials || series) {
			await applyUpdate(org.slug, { members, description, socials, series });
		}
	},
});

async function applyUpdate(
	slug: string,
	{ members, description, socials, series }: Omit<Options, "isEstablished">,
) {
	const org = await TournamentOrganizationRepository.findBySlug(slug);
	invariant(org, "Organization not found");

	// the org edit page saves everything at once, so what exists already is read
	// back and sent along
	await TournamentOrganizationRepository.update({
		id: org.id,
		name: org.name,
		description: description !== undefined ? description : org.description,
		socials: socials ?? org.socials,
		members: [
			...org.members.map((member) => ({
				userId: member.id,
				role: member.role,
				roleDisplayName: member.roleDisplayName,
			})),
			...(members ?? []).map((member) => ({
				...member,
				roleDisplayName: null,
			})),
		],
		series: series ?? [],
		badges: [],
	});
}
