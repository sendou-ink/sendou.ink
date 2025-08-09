import type { LoaderFunctionArgs } from "@remix-run/node";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { findVodById } from "../VodRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const vod = notFoundIfFalsy(await findVodById(Number(params.id)));

	return { vod };
};
