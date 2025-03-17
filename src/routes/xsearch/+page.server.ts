import * as XRankPlacementRepository from "./x-rank-placement-repository.server";

export const load = async () => {
	return {
		seasons: XRankPlacementRepository.findAllAvailableSeasons(),
	};
};
