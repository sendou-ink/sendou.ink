import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { notify } from "~/features/notifications/core/notify.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { SQManager } from "../core/SQManager.server";
import { preparingSchema } from "../q-schemas.server";

export type SendouQPreparingAction = typeof action;

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: preparingSchema,
	});

	const ownGroup = SQManager.findOwnGroup(user.id);
	errorToastIfFalsy(ownGroup, "No group found");

	// no perms, possibly just lost them so no more graceful degradation
	if (ownGroup.usersRole === "REGULAR") {
		return null;
	}

	const season = Seasons.current();
	errorToastIfFalsy(season, "Season is not active");

	switch (data._action) {
		case "JOIN_QUEUE": {
			await QRepository.setPreparingGroupAsActive(ownGroup.id);

			return redirect(SENDOUQ_LOOKING_PAGE);
		}
		case "ADD_TRUSTED": {
			const available = await QRepository.findActiveGroupMembers();
			if (available.some(({ userId }) => userId === data.id)) {
				return { error: "taken" } as const;
			}

			errorToastIfFalsy(
				(await QRepository.usersThatTrusted(user.id)).trusters.some(
					(trusterUser) => trusterUser.id === data.id,
				),
				"Not trusted",
			);

			await QRepository.addMember(ownGroup.id, {
				userId: data.id,
				role: "MANAGER",
			});

			await QRepository.refreshTrust({
				trustGiverUserId: data.id,
				trustReceiverUserId: user.id,
			});

			notify({
				userIds: [data.id],
				notification: {
					type: "SQ_ADDED_TO_GROUP",
					meta: {
						adderUsername: user.username,
					},
				},
			});

			return null;
		}
		default: {
			assertUnreachable(data);
		}
	}
};
