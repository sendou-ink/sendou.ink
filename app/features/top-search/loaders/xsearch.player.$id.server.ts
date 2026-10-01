import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as XRankPlacementRepository from "../XRankPlacementRepository.server";

export const loader = async (args: LoaderFunctionArgs) => {
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});

	const { user } = notFoundIfNullish(await playerWithUser(params.id));
	const placements = await playerPlacements(params.id);
	const primaryName = notFoundIfNullish(placements.at(0)).name;
	const aliases = R.unique(
		placements
			.map((placement) => placement.name)
			.filter((name) => name !== primaryName),
	);

	return {
		placements,
		linkedUser: user,
		names: {
			primary: primaryName,
			aliases,
		},
	};
};

function playerWithUser(playerId: number) {
	return XRankPlacementRepository.players()
		.where({ id: playerId })
		.with(UserRepository.withUser("user", "SplatoonPlayer.userId"))
		.executeTakeFirst();
}

function playerPlacements(playerId: number) {
	return XRankPlacementRepository.placements()
		.where({ playerId })
		.newestFirst()
		.bestRankFirst()
		.execute();
}
