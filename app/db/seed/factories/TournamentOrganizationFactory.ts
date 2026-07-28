import type { Tables } from "~/db/tables";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";

type Member = {
	userId: number;
	role: Tables["TournamentOrganizationMember"]["role"];
};

type Options = {
	/** Members besides the owner, who is an admin of the organization regardless. */
	members?: Array<Member>;
	isEstablished?: boolean;
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
	applyOptions: async (org, { members, isEstablished }: Options) => {
		if (isEstablished) {
			await TournamentOrganizationRepository.updateIsEstablished(org.id, true);
		}

		if (members) {
			await addMembers(org.slug, members);
		}
	},
});

async function addMembers(slug: string, members: Array<Member>) {
	const org = await TournamentOrganizationRepository.findBySlug(slug);
	invariant(org, "Organization not found");

	// the org edit page saves the whole member list at once, so the memberships that
	// exist already are read back and sent along with the new ones
	await TournamentOrganizationRepository.update({
		id: org.id,
		name: org.name,
		description: org.description,
		socials: org.socials,
		members: [
			...org.members.map((member) => ({
				userId: member.id,
				role: member.role,
				roleDisplayName: member.roleDisplayName,
			})),
			...members.map((member) => ({ ...member, roleDisplayName: null })),
		],
		series: [],
		badges: [],
	});
}
