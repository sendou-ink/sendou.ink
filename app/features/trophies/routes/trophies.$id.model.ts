import type { LoaderFunctionArgs } from "react-router";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as TrophyRepository from "../TrophyRepository.server";

export type TrophyModelLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id } = parseParams({
		params,
		schema: idObject,
	});

	return {
		model: notFoundIfNullish(await TrophyRepository.findModelById(id)),
	};
};
