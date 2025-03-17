import * as XRankPlacementRepository from "./x-rank-placement-repository.server";

export const load = async ({ url }) => {
	console.log(url.searchParams.get("division")); // note: needed for tracking

	return {
		seasons: XRankPlacementRepository.findAllAvailableSeasons(),
	};
};
