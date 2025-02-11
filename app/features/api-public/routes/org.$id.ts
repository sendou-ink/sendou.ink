import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { db } from "~/db/sql";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { userSubmittedImage } from "~/utils/urls";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetTournamentOrganizationResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
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
				"UserSubmittedImage.url as logoUrl",
				jsonArrayFrom(
					eb
						.selectFrom("TournamentOrganizationMember")
						.innerJoin("User", "User.id", "TournamentOrganizationMember.userId")
						.select([
							"User.id",
							"User.discordId",
							"User.username",
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
		logoUrl: organization.logoUrl
			? userSubmittedImage(organization.logoUrl)
			: null,
		socialLinkUrls: organization.socials ?? [],
		url: `https://sendou.ink/org/${organization.slug}`,
		members: organization.members.map((member) => ({
			userId: member.id,
			discordId: member.discordId,
			name: member.username,
			role: member.role,
			roleDisplayName: member.roleDisplayName,
		})),
	};

	return await cors(request, json(result));
};
