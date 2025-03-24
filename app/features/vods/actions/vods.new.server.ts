import { type ActionFunction, redirect } from "@remix-run/node";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { vodVideoPage } from "~/utils/urls";
import { createVod, updateVodByReplacing } from "../queries/createVod.server";
import { findVodById } from "../queries/findVodById.server";
import { videoInputSchema } from "../vods-schemas";
import { canAddVideo, canEditVideo } from "../vods-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: videoInputSchema,
	});

	if (!canAddVideo(user)) {
		throw new Response(null, { status: 401 });
	}

	let video: Tables["Video"];
	if (data.vodToEditId) {
		const vod = notFoundIfFalsy(findVodById(data.vodToEditId));

		if (
			!canEditVideo({
				userId: user.id,
				submitterUserId: vod.submitterUserId,
				povUserId: typeof vod.pov === "string" ? undefined : vod.pov?.id,
			})
		) {
			throw new Response("no permissions to edit this vod", { status: 401 });
		}

		video = updateVodByReplacing({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
			id: data.vodToEditId,
		});
	} else {
		video = createVod({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
		});
	}

	throw redirect(vodVideoPage(video.id));
};
