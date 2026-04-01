import { CloseExpiredCommissionsRoutine } from "./closeExpiredCommissions";
import { DeleteObsoleteMatchVodsRoutine } from "./deleteObsoleteMatchVods";
import { DeleteOldNotificationsRoutine } from "./deleteOldNotifications";
import { DeleteOrphanArtTagsRoutine } from "./deleteOrphanArtTags";
import { NotifyCheckInStartRoutine } from "./notifyCheckInStart";
import { NotifyPlusServerVotingRoutine } from "./notifyPlusServerVoting";
import { NotifyScrimStartingSoonRoutine } from "./notifyScrimStartingSoon";
import { NotifySeasonStartRoutine } from "./notifySeasonStart";
import { SetOldGroupsAsInactiveRoutine } from "./setOldGroupsAsInactive";
import { SyncLiveStreamsRoutine } from "./syncLiveStreams";
import { SyncSplatoonRotationsRoutine } from "./syncSplatoonRotations";
import { SyncTournamentVodsRoutine } from "./syncTournamentVods";
import { UpdatePatreonDataRoutine } from "./updatePatreonData";

/** List of Routines that should occur hourly at XX:00 */
export const everyHourAt00 = [
	NotifySeasonStartRoutine,
	NotifyPlusServerVotingRoutine,
	NotifyCheckInStartRoutine,
	NotifyScrimStartingSoonRoutine,
	SyncSplatoonRotationsRoutine,
	SyncTournamentVodsRoutine,
];

/** List of Routines that should occur hourly at XX:30 */
export const everyHourAt30 = [
	SetOldGroupsAsInactiveRoutine,
	UpdatePatreonDataRoutine,
];

/** List of Routines that should occur daily */
export const daily = [
	DeleteObsoleteMatchVodsRoutine,
	DeleteOldNotificationsRoutine,
	CloseExpiredCommissionsRoutine,
	DeleteOrphanArtTagsRoutine,
];

/** List of Routines that should occur every 2 minutes */
export const everyTwoMinutes = [SyncLiveStreamsRoutine];
