import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as TrophyRepository from "../TrophyRepository.server";
import { canAccessTrophies } from "../trophies-utils";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	if (!canAccessTrophies(getUser())) {
		throw new Response(null, { status: 404 });
	}

	const { id } = parseParams({
		params,
		schema: idObject,
	});

	const [trophy, tournaments] = await Promise.all([
		TrophyRepository.findById(id).then(notFoundIfNullish),
		TrophyRepository.findTournamentsByTrophyId(id),
	]);

	return {
		trophy,
		tournaments,
	};
};
