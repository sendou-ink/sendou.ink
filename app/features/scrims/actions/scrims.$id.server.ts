import type { ActionFunctionArgs } from "react-router";
import { notify } from "~/features/notifications/core/notify.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { databaseTimestampToDate } from "../../../utils/dates";
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

	errorToastIfFalsy(Scrim.isAccepted(post), "Scrim is not accepted");
	errorToastIfFalsy(!post.canceled, "Scrim is already canceled");

	if (databaseTimestampToDate(Scrim.getStartTime(post)) < new Date()) {
		errorToast("Cannot cancel a scrim that was already scheduled to start");
	}

	await ScrimPostRepository.cancelScrim(id, {
		userId: user.id,
		reason: data.reason,
	});

	const acceptedRequest = post.requests.find((r) => r.isAccepted);
	if (acceptedRequest) {
		const postTeamName = Scrim.sideDisplayName(post);
		const requestTeamName = Scrim.sideDisplayName(acceptedRequest);

		notify({
			userIds: post.users.map((m) => m.id),
			defaultSeenUserIds: [user.id],
			notification: {
				type: "SCRIM_CANCELED",
				meta: { id: post.id, opponentTeamName: requestTeamName },
			},
		});

		notify({
			userIds: acceptedRequest.users.map((m) => m.id),
			defaultSeenUserIds: [user.id],
			notification: {
				type: "SCRIM_CANCELED",
				meta: { id: post.id, opponentTeamName: postTeamName },
			},
		});
	}

	return null;
};
