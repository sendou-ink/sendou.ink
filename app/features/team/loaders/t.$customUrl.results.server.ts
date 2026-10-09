import type { LoaderFunctionArgs } from "react-router";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";

export type TeamResultsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { customUrl } = parseParams({ params, schema: teamParamsSchema });

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl),
	);

	const results = await TeamRepository.findResultsById(team.id);

	return {
		results,
	};
};
