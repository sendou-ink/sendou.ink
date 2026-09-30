import { add, sub } from "date-fns";
import { notify } from "../features/notifications/core/notify.server";
import * as Scrim from "../features/scrims/core/Scrim";
import * as ScrimPostRepository from "../features/scrims/ScrimPostRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const NotifyScrimStartingSoonRoutine = new Routine({
	name: "NotifyScrimStartingSoon",
	func: async () => {
		const now = new Date();

		const scrims =
			await ScrimPostRepository.findAcceptedScrimsBetweenTwoTimestamps({
				startTime: now,
				endTime: add(now, { hours: 1 }),
				excludeRecentlyCreated: sub(now, { hours: 2 }),
			});

		for (const scrim of scrims) {
			const acceptedRequest = scrim.requests.find((r) => r.isAccepted);
			if (!acceptedRequest) continue;

			const postTeamName = Scrim.sideDisplayName(scrim);
			const requestTeamName = Scrim.sideDisplayName(acceptedRequest);

			logger.info(
				`Notifying scrim starting soon for scrim ${scrim.id} with ${scrim.users.length + acceptedRequest.users.length} participants`,
			);

			await notify({
				notification: {
					type: "SCRIM_STARTING_SOON",
					meta: { id: scrim.id, opponentTeamName: requestTeamName },
				},
				userIds: scrim.users.map((u) => u.id),
			});

			await notify({
				notification: {
					type: "SCRIM_STARTING_SOON",
					meta: { id: scrim.id, opponentTeamName: postTeamName },
				},
				userIds: acceptedRequest.users.map((u) => u.id),
			});
		}
	},
});
