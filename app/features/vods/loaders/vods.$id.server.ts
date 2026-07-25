import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const vod = notFoundIfNullish(
		await VodRepository.findVodById(Number(params.id)),
	);

	return { vod };
};
