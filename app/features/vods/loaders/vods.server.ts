import type { LoaderFunctionArgs } from "react-router";
import {
	parseSearchParams,
	redirectIfPageOutOfBounds,
} from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";
import { VODS_PAGE_BATCH_SIZE } from "../vods-constants";
import { vodsSearchParamsSchema } from "../vods-schemas";

export const loader = async ({ request, url }: LoaderFunctionArgs) => {
	const { page, ...filters } = parseSearchParams({
		request,
		schema: vodsSearchParamsSchema,
	});

	const [vods, totalCount] = await Promise.all([
		VodRepository.findVods({
			...filters,
			limit: VODS_PAGE_BATCH_SIZE,
			offset: (page - 1) * VODS_PAGE_BATCH_SIZE,
		}),
		VodRepository.countVods(filters),
	]);

	const pagesCount = Math.max(1, Math.ceil(totalCount / VODS_PAGE_BATCH_SIZE));

	redirectIfPageOutOfBounds({ url, page, pagesCount });

	return {
		vods,
		currentPage: page,
		pagesCount,
	};
};
