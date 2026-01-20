import { jsonArrayFrom } from "kysely/helpers/sqlite";
import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { requireBearerAuth } from "../api-public-utils.server";
import type { GetTournamentOrganizationResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	requireBearerAuth(request);

	const { id } = parseParams({ params, schema: paramsSchema });

	const organization = notFoundIfFalsy(
		await db
			.selectFrom("TournamentOrganization")
			.leftJoin(
				"UserSubmittedImage",
				"UserSubmittedImage.id",
				"TournamentOrganization.avatarImgId",
			)
			.select((eb) => [
				"TournamentOrganization.id",
				"TournamentOrganization.name",
				"TournamentOrganization.description",
				"TournamentOrganization.socials",
				"TournamentOrganization.slug",
				concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
					"logoUrl",
				),
				jsonArrayFrom(
					eb
						.selectFrom("TournamentOrganizationMember")
						.innerJoin("User", "User.id", "TournamentOrganizationMember.userId")
						.select([
							"User.id",
							"User.discordId",
							"User.username",
							"User.pronouns",
							"TournamentOrganizationMember.role",
							"TournamentOrganizationMember.roleDisplayName",
						])
						.where("TournamentOrganizationMember.organizationId", "=", id),
				).as("members"),
			])
			.where("TournamentOrganization.id", "=", id)
			.executeTakeFirst(),
	);

	const result: GetTournamentOrganizationResponse = {
		id: organization.id,
		name: organization.name,
		description: organization.description,
		logoUrl: organization.logoUrl,
		socialLinkUrls: organization.socials ?? [],
		url: `https://sendou.ink/org/${organization.slug}`,
		members: organization.members.map((member) => ({
			userId: member.id,
			discordId: member.discordId,
			name: member.username,
			pronouns: member.pronouns,
			role: member.role,
			roleDisplayName: member.roleDisplayName,
		})),
	};

	return Response.json(result);
};
