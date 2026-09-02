import { CloseExpiredChatRoomsRoutine } from "./closeExpiredChatRooms";
import { CloseExpiredCommissionsRoutine } from "./closeExpiredCommissions";
import { CloseExpiredContinueVotesRoutine } from "./closeExpiredContinueVotes";
import { ComputeLutiDivsRoutine } from "./computeLutiDivs";
import { DeleteObsoleteMatchVodsRoutine } from "./deleteObsoleteMatchVods";
import { DeleteOldAvailabilityRoutine } from "./deleteOldAvailability";
import { DeleteOldExternalStreamsRoutine } from "./deleteOldExternalStreams";
import { DeleteOldNotificationsRoutine } from "./deleteOldNotifications";
import { DeleteOldPendingFriendRequestsRoutine } from "./deleteOldPendingFriendRequests";
import { DeleteOldScrimPickupRostersRoutine } from "./deleteOldScrimPickupRosters";
import { DeleteOldTournamentAuditLogsRoutine } from "./deleteOldTournamentAuditLogs";
import { DeleteOrphanArtTagsRoutine } from "./deleteOrphanArtTags";
import { EvictStaleRunningTournamentsRoutine } from "./evictStaleRunningTournaments";
import { ExpireReadyChecksRoutine } from "./expireReadyChecks";
import { NotifyCheckInStartRoutine } from "./notifyCheckInStart";
import { NotifyPlusServerVotingRoutine } from "./notifyPlusServerVoting";
import { NotifyScheduleTeamReminderRoutine } from "./notifyScheduleTeamReminder";
import { NotifyScrimStartingSoonRoutine } from "./notifyScrimStartingSoon";
import { NotifySeasonEndRoutine } from "./notifySeasonEnd";
import { NotifySeasonStartRoutine } from "./notifySeasonStart";
import { OptimizeDatabaseRoutine } from "./optimizeDatabase";
import { ResolveStaleSQMatchesRoutine } from "./resolveStaleSQMatches";
import { SetOldGroupsAsInactiveRoutine } from "./setOldGroupsAsInactive";
import { SyncLiveStreamsRoutine } from "./syncLiveStreams";
import { SyncSplatoonRotationsRoutine } from "./syncSplatoonRotations";
import { SyncTournamentVodsRoutine } from "./syncTournamentVods";
import { UpdatePatreonDataRoutine } from "./updatePatreonData";
import { VacuumDatabaseRoutine } from "./vacuumDatabase";

/** hourly at XX:00 */
export const everyHourAt00 = [
	NotifySeasonStartRoutine,
	NotifyPlusServerVotingRoutine,
	NotifyCheckInStartRoutine,
	NotifyScrimStartingSoonRoutine,
	SyncSplatoonRotationsRoutine,
	SyncTournamentVodsRoutine,
];

/** hourly at XX:30 */
export const everyHourAt30 = [
	SetOldGroupsAsInactiveRoutine,
	UpdatePatreonDataRoutine,
	CloseExpiredContinueVotesRoutine,
	DeleteOldExternalStreamsRoutine,
	EvictStaleRunningTournamentsRoutine,
	ResolveStaleSQMatchesRoutine,
];

export const daily = [
	NotifySeasonEndRoutine,
	DeleteObsoleteMatchVodsRoutine,
	DeleteOldNotificationsRoutine,
	DeleteOldPendingFriendRequestsRoutine,
	DeleteOldTournamentAuditLogsRoutine,
	DeleteOldScrimPickupRostersRoutine,
	DeleteOldAvailabilityRoutine,
	NotifyScheduleTeamReminderRoutine,
	CloseExpiredCommissionsRoutine,
	CloseExpiredChatRoomsRoutine,
	DeleteOrphanArtTagsRoutine,
	ComputeLutiDivsRoutine,
	OptimizeDatabaseRoutine,
];

export const weekly = [VacuumDatabaseRoutine];

export const everyTwoMinutes = [
	SyncLiveStreamsRoutine,
	ExpireReadyChecksRoutine,
];
