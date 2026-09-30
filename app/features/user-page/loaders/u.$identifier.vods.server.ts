import type { LoaderFunctionArgs } from "react-router";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import { VODS_PAGE_BATCH_SIZE } from "~/features/vods/vods-constants";
import { userVodsSearchParams } from "~/features/vods/vods-search-params";
import { paginate } from "~/utils/remix.server";

export const loader = async ({ request, url }: LoaderFunctionArgs) => {
	const { page } = userVodsSearchParams.parse(request);

	const listing = await VodRepository.userVods(userPageUserId()).paginate({
		page,
		size: VODS_PAGE_BATCH_SIZE,
	});

	return {
		vods: listing.items,
		...paginate({
			url,
			page: listing.currentPage,
			pageSize: VODS_PAGE_BATCH_SIZE,
			totalCount: listing.totalCount,
		}),
	};
};
