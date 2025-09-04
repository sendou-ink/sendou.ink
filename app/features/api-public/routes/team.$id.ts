import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod/v4";
import { db } from "~/db/sql";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { userSubmittedImage } from "~/utils/urls-img";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetTeamResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { id: teamId } = parseParams({ params, schema: paramsSchema });

	const team = notFoundIfFalsy(
		await db
			.selectFrom("Team")
			.leftJoin(
				"UserSubmittedImage",
				"UserSubmittedImage.id",
				"Team.avatarImgId",
			)
			.select([
				"Team.id",
				"Team.name",
				"Team.customUrl",
				"UserSubmittedImage.url as logoUrl",
			])
			.where("Team.id", "=", teamId)
			.executeTakeFirst(),
	);

	const logoUrl = team.logoUrl ? userSubmittedImage(team.logoUrl) : null;

	const result: GetTeamResponse = {
		id: team.id,
		name: team.name,
		teamPageUrl: `https://sendou.ink/t/${team.customUrl}`,
		logoUrl,
	};

	return await cors(request, json(result));
};
