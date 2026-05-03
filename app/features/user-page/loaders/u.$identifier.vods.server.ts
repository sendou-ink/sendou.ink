import type { LoaderFunctionArgs } from "react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import { VODS_PAGE_BATCH_SIZE } from "~/features/vods/vods-constants";
import { userVodsSearchParamsSchema } from "~/features/vods/vods-schemas";
import {
	notFoundIfFalsy,
	parseSearchParams,
	redirectIfPageOutOfBounds,
} from "~/utils/remix.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const userId = notFoundIfFalsy(
		await UserRepository.identifierToUserId(params.identifier!),
	).id;

	const { page } = parseSearchParams({
		request,
		schema: userVodsSearchParamsSchema,
	});

	const [vods, totalCount] = await Promise.all([
		VodRepository.findVods({
			userId,
			limit: VODS_PAGE_BATCH_SIZE,
			offset: (page - 1) * VODS_PAGE_BATCH_SIZE,
		}),
		VodRepository.countVods({ userId }),
	]);

	const pagesCount = Math.max(1, Math.ceil(totalCount / VODS_PAGE_BATCH_SIZE));

	redirectIfPageOutOfBounds({ request, page, pagesCount });

	return {
		vods,
		currentPage: page,
		pagesCount,
	};
};
