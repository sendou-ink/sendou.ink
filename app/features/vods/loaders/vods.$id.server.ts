import type { LoaderFunctionArgs } from "@remix-run/node";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { findVodById } from "../queries/findVodById.server";

export const loader = ({ params }: LoaderFunctionArgs) => {
	const vod = notFoundIfFalsy(findVodById(Number(params.id)));

	return { vod };
};
