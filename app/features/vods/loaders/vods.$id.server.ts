import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as VodRepository from "../VodRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: vodId } = parseParams({ params, schema: idObject });
	const vod = notFoundIfNullish(await VodRepository.findVodById(vodId));

	return { vod };
};
