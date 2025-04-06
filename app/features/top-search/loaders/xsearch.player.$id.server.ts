import type { LoaderFunctionArgs } from "@remix-run/node";
import { removeDuplicates } from "~/utils/arrays";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { findPlacementsByPlayerId } from "../queries/findPlacements.server";

export const loader = async (args: LoaderFunctionArgs) => {
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});

	const placements = notFoundIfFalsy(findPlacementsByPlayerId(params.id));

	const primaryName = placements[0].name;
	const aliases = removeDuplicates(
		placements
			.map((placement) => placement.name)
			.filter((name) => name !== primaryName),
	);

	return {
		placements,
		names: {
			primary: primaryName,
			aliases,
		},
	};
};
