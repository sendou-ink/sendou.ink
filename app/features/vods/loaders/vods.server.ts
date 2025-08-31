import type { LoaderFunctionArgs } from "@remix-run/node";
import * as VodRepository from "../VodRepository.server";
import { VODS_PAGE_BATCH_SIZE } from "../vods-constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const url = new URL(request.url);

	const limit = Number(url.searchParams.get("limit") ?? VODS_PAGE_BATCH_SIZE);

	const vods = await VodRepository.findVods({
		...Object.fromEntries(
			Array.from(url.searchParams.entries()).filter(([, value]) => value),
		),
		limit: limit + 1,
	});

	let hasMoreVods = false;
	if (vods.length > limit) {
		vods.pop();
		hasMoreVods = true;
	}

	return {
		vods,
		limit,
		hasMoreVods,
	};
};
