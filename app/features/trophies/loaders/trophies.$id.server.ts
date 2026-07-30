import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as TrophyRepository from "../TrophyRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
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
