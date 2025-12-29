import type { LoaderFunctionArgs } from "react-router";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as BadgeRepository from "../BadgeRepository.server";

export type BadgeDetailsLoaderData = SerializeFrom<typeof loader>;
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id } = parseParams({
		params,
		schema: idObject,
	});
	const badge = notFoundIfFalsy(await BadgeRepository.findById(id));

	return {
		badge,
	};
};
