import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfFalsy } from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const vod = notFoundIfFalsy(
		await VodRepository.findVodById(Number(params.id)),
	);

	return { vod };
};
