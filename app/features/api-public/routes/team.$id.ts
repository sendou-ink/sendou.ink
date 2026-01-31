import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetTeamResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: teamId } = parseParams({ params, schema: paramsSchema });

	const team = notFoundIfFalsy(
		await db
			.selectFrom("Team")
			.leftJoin(
				"UserSubmittedImage",
				"UserSubmittedImage.id",
				"Team.avatarImgId",
			)
			.select((eb) => [
				"Team.id",
				"Team.name",
				"Team.customUrl",
				concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
					"logoUrl",
				),
			])
			.where("Team.id", "=", teamId)
			.executeTakeFirst(),
	);

	const result: GetTeamResponse = {
		id: team.id,
		name: team.name,
		logoUrl: team.logoUrl,
		teamPageUrl: `https://sendou.ink/t/${team.customUrl}`,
	};

	return Response.json(result);
};
