import type { LoaderFunctionArgs } from "react-router";
import { paginate } from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";
import { VODS_PAGE_BATCH_SIZE } from "../vods-constants";
import { vodsSearchParams } from "../vods-search-params";

export const loader = async ({ request, url }: LoaderFunctionArgs) => {
	const { page, ...filters } = vodsSearchParams.parse(request);

	const listing = await listedVods(filters).paginate({
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

function listedVods({
	weapon,
	mode,
	stageId,
	type,
}: Omit<ReturnType<typeof vodsSearchParams.parse>, "page">) {
	return VodRepository.vods()
		.where({ type: type ?? undefined })
		.havingMatch({ mode, stageId, weapon })
		.withWeapons(weapon);
}
