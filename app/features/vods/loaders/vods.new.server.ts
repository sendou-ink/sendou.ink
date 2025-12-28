import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod/v4";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { actualNumber, id } from "~/utils/zod";
import * as VodRepository from "../VodRepository.server";
import { canEditVideo, vodToVideoBeingAdded } from "../vods-utils";

const newVodLoaderParamsSchema = z.object({
	vod: z.preprocess(actualNumber, id),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const url = new URL(request.url);
	const params = newVodLoaderParamsSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);

	if (!params.success) {
		return { vodToEdit: null };
	}

	const vod = notFoundIfFalsy(await VodRepository.findVodById(params.data.vod));
	const vodToEdit = vodToVideoBeingAdded(vod);

	if (
		!canEditVideo({
			submitterUserId: vod.submitterUserId,
			userId: user.id,
			povUserId:
				vodToEdit.pov?.type === "USER" ? vodToEdit.pov.userId : undefined,
		})
	) {
		return { vodToEdit: null };
	}

	return { vodToEdit: { ...vodToEdit, id: vod.id } };
};
