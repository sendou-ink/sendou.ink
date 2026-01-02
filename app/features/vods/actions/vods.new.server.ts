import { type ActionFunction, redirect } from "react-router";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { notFoundIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { vodVideoPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";
import { videoInputSchema } from "../vods-schemas";
import { canEditVideo } from "../vods-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser();
	requireRole(user, "VIDEO_ADDER");

	const data = await parseRequestPayload({
		request,
		schema: videoInputSchema,
	});

	let video: Tables["Video"];
	if (data.vodToEditId) {
		const vod = notFoundIfFalsy(
			await VodRepository.findVodById(data.vodToEditId),
		);

		if (
			!canEditVideo({
				userId: user.id,
				submitterUserId: vod.submitterUserId,
				povUserId: typeof vod.pov === "string" ? undefined : vod.pov?.id,
			})
		) {
			throw new Response("no permissions to edit this vod", { status: 401 });
		}

		video = await VodRepository.update({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
			id: data.vodToEditId,
		});
	} else {
		video = await VodRepository.insert({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
		});
	}

	throw redirect(vodVideoPage(video.id));
};
