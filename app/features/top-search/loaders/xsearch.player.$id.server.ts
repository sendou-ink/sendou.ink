import type { LoaderFunctionArgs } from "@remix-run/node";
import { removeDuplicates } from "~/utils/arrays";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { findPlacementsByPlayerId } from "../queries/findPlacements.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const placements = notFoundIfFalsy(
		findPlacementsByPlayerId(Number(params.id)),
	);

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
