import { add } from "date-fns";
import { currentSeason } from "../features/mmr/season";
import { userSkills } from "../features/mmr/tiered.server";
import * as NotificationRepository from "../features/notifications/NotificationRepository.server";
import { notify } from "../features/notifications/core/notify.server";
import { Routine } from "./routine.server";

export const NotifySeasonStartRoutine = new Routine({
	name: "NotifySeasonStart",
	func: async () => {
		const season = currentSeason(new Date());

		// old notifications get deleted after 14 days, make sure we don't send the same notification twice
		if (!season || add(season.starts, { days: 7 }) < new Date()) {
			return;
		}

		const seasonNotifications =
			await NotificationRepository.findAllByType("SEASON_STARTED");

		if (
			seasonNotifications.some(
				(notification) => notification.meta.seasonNth === season.nth,
			)
		) {
			return;
		}

		const lastSeasonsUsers = userSkills(season.nth - 1).userSkills;

		await notify({
			notification: {
				type: "SEASON_STARTED",
				meta: {
					seasonNth: season.nth,
				},
			},
			userIds: Object.keys(lastSeasonsUsers).map(Number),
		});
	},
});
