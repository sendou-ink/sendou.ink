import type { Tables } from "~/db/tables";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";
import * as ImageFactory from "./ImageFactory";

type Member = {
	userId: number;
	role: Tables["TournamentOrganizationMember"]["role"];
};

type InsertArgs = Parameters<typeof TournamentOrganizationRepository.insert>[0];
type UpdateArgs = Parameters<typeof TournamentOrganizationRepository.update>[0];

type Options = {
	/** Members besides the owner, who is an admin of the organization regardless. */
	members?: Array<Member>;
	isEstablished?: boolean;
	description?: string | null;
	socials?: string[] | null;
	series?: UpdateArgs["series"];
	/** Filename of the logo; one seeded to the local image storage renders in dev. */
	avatarFileName?: string;
};

/**
 * Creates tournament organizations. `ownerId` is who owns it, added as its admin by
 * the repository. Slug follows from the name, as it does in production.
 */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		name: `Organization ${seq}`,
	}),
	insert: async (args: InsertArgs) => ({
		...(await TournamentOrganizationRepository.insert(args)),
		ownerId: args.ownerId,
	}),
	applyOptions: async (
		org,
		{
			members,
			isEstablished,
			description,
			socials,
			series,
			avatarFileName,
		}: Options,
	) => {
		if (isEstablished) {
			await TournamentOrganizationRepository.updateIsEstablished(org.id, true);
		}

		if (
			members ||
			description !== undefined ||
			socials ||
			series ||
			avatarFileName
		) {
			await applyUpdate(org, {
				members,
				description,
				socials,
				series,
				avatarFileName,
			});
		}
	},
});

async function applyUpdate(
	{ slug, ownerId }: { slug: string; ownerId: number },
	{
		members,
		description,
		socials,
		series,
		avatarFileName,
	}: Omit<Options, "isEstablished">,
) {
	const org = await TournamentOrganizationRepository.findBySlug(slug);
	invariant(org, "Organization not found");

	const avatar = avatarFileName
		? await ImageFactory.create(
				{ submitterUserId: ownerId, url: avatarFileName },
				{ isValidated: true },
			)
		: null;

	// the org edit page saves everything at once, so what exists already is read
	// back and sent along
	await TournamentOrganizationRepository.update({
		id: org.id,
		name: org.name,
		description: description !== undefined ? description : org.description,
		socials: socials ?? org.socials,
		avatarImgId: avatar?.id,
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
