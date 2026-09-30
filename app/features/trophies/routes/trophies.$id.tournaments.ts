import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as TrophyRepository from "../TrophyRepository.server";
import { canAccessTrophies } from "../trophies-utils";

export type TrophyTournamentsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	if (!canAccessTrophies(getUser())) {
		throw new Response(null, { status: 404 });
	}

	const { id } = parseParams({
		params,
		schema: idObject,
	});

	return {
		tournaments: await TrophyRepository.findTournamentsByTrophyId(id),
	};
};
