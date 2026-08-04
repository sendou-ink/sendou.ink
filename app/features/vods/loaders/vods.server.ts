import type { LoaderFunctionArgs } from "react-router";
import { paginate } from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";
import { VODS_PAGE_BATCH_SIZE } from "../vods-constants";
import { vodsSearchParams } from "../vods-search-params";

export const loader = async ({ request, url }: LoaderFunctionArgs) => {
	const { page, weapon, mode, stageId, type } = vodsSearchParams.parse(request);

	const filters = {
		weapon: weapon ?? undefined,
		mode: mode ?? undefined,
		stageId: stageId ?? undefined,
		type: type ?? undefined,
	};

	const [vods, totalCount] = await Promise.all([
		VodRepository.findVods({
			...filters,
			limit: VODS_PAGE_BATCH_SIZE,
			offset: (page - 1) * VODS_PAGE_BATCH_SIZE,
		}),
		VodRepository.countVods(filters),
	]);

	return {
		vods,
		...paginate({ url, page, pageSize: VODS_PAGE_BATCH_SIZE, totalCount }),
	};
};
