import type { LoaderFunctionArgs } from "@remix-run/node";
import { findVods } from "../queries/findVods.server";
import { VODS_PAGE_BATCH_SIZE } from "../vods-constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const url = new URL(request.url);

	const limit = Number(url.searchParams.get("limit") ?? VODS_PAGE_BATCH_SIZE);

	const vods = findVods({
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
