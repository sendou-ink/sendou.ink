import type { ActionFunctionArgs } from "react-router";
import { notify } from "~/features/notifications/core/notify.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import {
	databaseTimestampToDate,
	databaseTimestampToJavascriptTimestamp,
} from "../../../utils/dates";
import { errorToast } from "../../../utils/remix.server";
import { requireUser } from "../../auth/core/user.server";
import * as Scrim from "../core/Scrim";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { cancelScrimSchema } from "../scrims-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const { id } = parseParams({ params, schema: idObject });
	const post = notFoundIfFalsy(await ScrimPostRepository.findById(id));

	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: cancelScrimSchema,
	});

	requirePermission(post, "CANCEL");

	if (databaseTimestampToDate(Scrim.getStartTime(post)) < new Date()) {
		errorToast("Cannot cancel a scrim that was already scheduled to start");
	}

	await ScrimPostRepository.cancelScrim(id, {
		userId: user.id,
		reason: data.reason,
	});

	notify({
		userIds: Scrim.participantIdsListFromAccepted(post),
		defaultSeenUserIds: [user.id],
		notification: {
			type: "SCRIM_CANCELED",
			meta: {
				id: post.id,
				at: databaseTimestampToJavascriptTimestamp(Scrim.getStartTime(post)),
			},
		},
	});

	return null;
};
