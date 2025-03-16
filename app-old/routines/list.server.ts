import { DeleteOldNotificationsRoutine } from "./deleteOldNotifications";
import { DeleteOldTrustRoutine } from "./deleteOldTrusts";
import { NotifyCheckInStartRoutine } from "./notifyCheckInStart";
import { NotifyPlusServerVotingRoutine } from "./notifyPlusServerVoting";
import { NotifySeasonStartRoutine } from "./notifySeasonStart";
import { SetOldGroupsAsInactiveRoutine } from "./setOldGroupsAsInactive";
import { UpdatePatreonDataRoutine } from "./updatePatreonData";

/** List of Routines that should occur hourly at XX:00 */
export const everyHourAt00 = [
	NotifySeasonStartRoutine,
	NotifyPlusServerVotingRoutine,
	NotifyCheckInStartRoutine,
];

/** List of Routines that should occur hourly at XX:30 */
export const everyHourAt30 = [
	SetOldGroupsAsInactiveRoutine,
	UpdatePatreonDataRoutine,
];

/** List of Routines that should occur daily */
export const daily = [DeleteOldTrustRoutine, DeleteOldNotificationsRoutine];
