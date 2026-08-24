import { add } from "date-fns";
import * as Seasons from "../features/mmr/core/Seasons";
import { userSkills } from "../features/mmr/tiered.server";
import { notify } from "../features/notifications/core/notify.server";
import * as NotificationRepository from "../features/notifications/NotificationRepository.server";
import { Routine } from "./routine.server";

export const NotifySeasonEndRoutine = new Routine({
	name: "NotifySeasonEnd",
	func: async () => {
		const season = Seasons.previous();

		// old notifications get deleted after 14 days, make sure we don't send the same notification twice
		if (!season || add(season.ends, { days: 7 }) < new Date()) {
			return;
		}

		const seasonNotifications =
			await NotificationRepository.findAllByType("SEASON_ENDED");

		if (
			seasonNotifications.some(
				(notification) => notification.meta.seasonNth === season.nth,
			)
		) {
			return;
		}

		const { userSkills: seasonsUsers } = await userSkills(season.nth);

		// users with an approximate skill have no season summary to export
		const userIds = Object.entries(seasonsUsers)
			.filter(([, skill]) => !skill.approximate)
			.map(([userId]) => Number(userId));

		await notify({
			notification: {
				type: "SEASON_ENDED",
				meta: {
					seasonNth: season.nth,
				},
			},
			userIds,
		});
	},
});
