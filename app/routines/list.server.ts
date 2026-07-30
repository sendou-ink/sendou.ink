import { CloseExpiredCommissionsRoutine } from "./closeExpiredCommissions";
import { CloseExpiredContinueVotesRoutine } from "./closeExpiredContinueVotes";
import { ComputeLutiDivsRoutine } from "./computeLutiDivs";
import { DeleteObsoleteMatchVodsRoutine } from "./deleteObsoleteMatchVods";
import { DeleteOldExternalStreamsRoutine } from "./deleteOldExternalStreams";
import { DeleteOldNotificationsRoutine } from "./deleteOldNotifications";
import { DeleteOldPendingFriendRequestsRoutine } from "./deleteOldPendingFriendRequests";
import { DeleteOldTournamentAuditLogsRoutine } from "./deleteOldTournamentAuditLogs";
import { DeleteOrphanArtTagsRoutine } from "./deleteOrphanArtTags";
import { EvictStaleRunningTournamentsRoutine } from "./evictStaleRunningTournaments";
import { NotifyCheckInStartRoutine } from "./notifyCheckInStart";
import { NotifyPlusServerVotingRoutine } from "./notifyPlusServerVoting";
import { NotifyScrimStartingSoonRoutine } from "./notifyScrimStartingSoon";
import { NotifySeasonStartRoutine } from "./notifySeasonStart";
import { OptimizeDatabaseRoutine } from "./optimizeDatabase";
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
	CloseExpiredContinueVotesRoutine,
	DeleteOldExternalStreamsRoutine,
	EvictStaleRunningTournamentsRoutine,
];

/** List of Routines that should occur daily */
export const daily = [
	DeleteObsoleteMatchVodsRoutine,
	DeleteOldNotificationsRoutine,
	DeleteOldPendingFriendRequestsRoutine,
	DeleteOldTournamentAuditLogsRoutine,
	CloseExpiredCommissionsRoutine,
	DeleteOrphanArtTagsRoutine,
	ComputeLutiDivsRoutine,
	OptimizeDatabaseRoutine,
];

/** List of Routines that should occur every 2 minutes */
export const everyTwoMinutes = [SyncLiveStreamsRoutine];
