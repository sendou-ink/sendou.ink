import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetTeamResponse } from "../schema";

const paramsSchema = v.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: teamId } = parseParams({ params, schema: paramsSchema });

	const team = notFoundIfNullish(
		await TeamRepository.teams()
			.where({ id: teamId })
			.withLogo()
			.executeTakeFirst(),
	);

	const result: GetTeamResponse = {
		id: team.id,
		name: team.name,
		logoUrl: team.avatarUrl,
		teamPageUrl: `https://sendou.ink/t/${team.customUrl}`,
	};

	return Response.json(result);
};
