import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as TrophyRepository from "../TrophyRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id } = parseParams({
		params,
		schema: idObject,
	});

	const [trophy, tournaments] = await Promise.all([
		TrophyRepository.findById(id).then(notFoundIfFalsy),
		TrophyRepository.findTournamentsByTrophyId(id),
	]);

	return {
		trophy,
		tournaments,
	};
};
