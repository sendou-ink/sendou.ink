import type { LoaderFunctionArgs } from "react-router";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as TrophyRepository from "../TrophyRepository.server";

export type TrophyDetailsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id } = parseParams({
		params,
		schema: idObject,
	});
	const trophy = notFoundIfFalsy(await TrophyRepository.findById(id));

	return {
		trophy,
	};
};
