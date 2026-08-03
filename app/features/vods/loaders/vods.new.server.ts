import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";
import { vodsNewSearchParams } from "../vods-search-params";
import { canEditVideo, vodToVideoBeingAdded } from "../vods-utils";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { vod: vodId } = vodsNewSearchParams.parse(url);

	if (vodId === null) {
		return { vodToEdit: null };
	}

	const vod = notFoundIfNullish(await VodRepository.findVodById(vodId));
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
