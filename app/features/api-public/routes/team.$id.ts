import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { db } from "~/db/sql";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetTeamResponse } from "../schema";

const paramsSchema = v.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: teamId } = parseParams({ params, schema: paramsSchema });

	const team = notFoundIfNullish(
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
