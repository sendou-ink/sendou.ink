import * as Seasons from "../features/mmr/core/Seasons";
import * as NotificationRepository from "../features/notifications/NotificationRepository.server";
import { notify } from "../features/notifications/core/notify.server";
import { isVotingActive } from "../features/plus-voting/core";
import * as UserRepository from "../features/user-page/UserRepository.server";
import { Routine } from "./routine.server";

export const NotifyPlusServerVotingRoutine = new Routine({
	name: "NotifyPlusServerVoting",
	func: async () => {
		if (!isVotingActive()) return;

		const season = Seasons.current()!;

		const plusVotingNotifications = await NotificationRepository.findAllByType(
			"PLUS_VOTING_STARTED",
		);

		if (
			plusVotingNotifications.some(
				(notification) => notification.meta.seasonNth === season.nth,
			)
		) {
			return;
		}

		await notify({
			notification: {
				type: "PLUS_VOTING_STARTED",
				meta: {
					seasonNth: season.nth,
				},
			},
			userIds: (await UserRepository.findAllPlusServerMembers()).map(
				(member) => member.userId,
			),
		});
	},
});
