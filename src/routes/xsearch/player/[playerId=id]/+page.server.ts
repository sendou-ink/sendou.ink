import { error } from "@sveltejs/kit";
import * as XRankPlacementRepository from "../../x-rank-placement-repository.server";
import * as SplatoonPlayerRepository from "./splatoon-player-repository.server";
import { removeDuplicates } from "$lib/utils/arrays";

export const load = async ({ params }) => {
	const entries = await XRankPlacementRepository.findByPlayerId(Number(params.playerId));
	if (entries.length === 0) error(404);

	return {
		entries,
		user: await SplatoonPlayerRepository.findLinkedUserByPlayerId(Number(params.playerId)),
		names: {
			primary: entries[0].name,
			aliases: removeDuplicates(
				entries.map((placement) => placement.name).filter((name) => name !== entries[0].name),
			).join(", "),
		},
	};
};
