import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { badRequestIfFalsy, unauthorizedIfFalsy } from "~/utils/remix.server";
import { userVodsPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";
import { findVodById } from "../queries/findVodById.server";
import { canEditVideo } from "../vods-utils";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = await requireUser(request);

	const vod = badRequestIfFalsy(findVodById(Number(params.id)));

	unauthorizedIfFalsy(
		canEditVideo({
			userId: user.id,
			submitterUserId: vod.submitterUserId,
			povUserId: typeof vod.pov === "string" ? undefined : vod.pov?.id,
		}),
	);

	await VodRepository.deleteById(vod.id);

	return redirect(userVodsPage(user));
};
