import type { LoaderFunctionArgs } from "react-router";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy } from "~/utils/remix.server";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";

export type TeamResultsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));

	const results = await TeamRepository.findResultsById(team.id);

	return {
		results,
	};
};
