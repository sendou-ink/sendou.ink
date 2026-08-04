import type { LoaderFunctionArgs } from "react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import { VODS_PAGE_BATCH_SIZE } from "~/features/vods/vods-constants";
import { userVodsSearchParams } from "~/features/vods/vods-search-params";
import { notFoundIfNullish, paginate } from "~/utils/remix.server";

export const loader = async ({ params, request, url }: LoaderFunctionArgs) => {
	const userId = notFoundIfNullish(
		await UserRepository.findIdByIdentifier(params.identifier!),
	).id;

	const { page } = userVodsSearchParams.parse(request);

	const [vods, totalCount] = await Promise.all([
		VodRepository.findVods({
			userId,
			limit: VODS_PAGE_BATCH_SIZE,
			offset: (page - 1) * VODS_PAGE_BATCH_SIZE,
		}),
		VodRepository.countVods({ userId }),
	]);

	return {
		vods,
		...paginate({ url, page, pageSize: VODS_PAGE_BATCH_SIZE, totalCount }),
	};
};
