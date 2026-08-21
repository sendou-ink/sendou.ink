import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";
import { canAddCustomizedColors } from "../team-utils";

export type TeamLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { customUrl } = v.parse(teamParamsSchema, params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl),
	);

	const results = await TeamRepository.findResultPlacementsById(team.id);

	return {
		team,
		customTheme: canAddCustomizedColors(team) ? team.customTheme : null,
		results: resultsMapped(results),
	};
};

function resultsMapped(results: TeamRepository.FindResultPlacementsById) {
	if (results.length === 0) {
		return null;
	}

	const firstPlaceResults = results.filter((result) => result.placement === 1);
	const secondPlaceResults = results.filter((result) => result.placement === 2);
	const thirdPlaceResults = results.filter((result) => result.placement === 3);

	return {
		count: results.length,
		placements: [
			{
				placement: 1,
				count: firstPlaceResults.length,
			},
			{
				placement: 2,
				count: secondPlaceResults.length,
			},
			{
				placement: 3,
				count: thirdPlaceResults.length,
			},
		],
	};
}
