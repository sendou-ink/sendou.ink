import {
	differenceInSeconds,
	endOfMonth,
	startOfMonth,
	subDays,
} from "date-fns";
import * as ChatRoomResolver from "~/features/chat/ChatRoomResolver.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as Daily from "../core/Daily.server";
import * as VoiceAvailability from "../core/VoiceAvailability.server";
import * as VoiceCost from "../core/VoiceCost";
import * as VoicePresence from "../core/VoicePresence.server";
import * as VoiceRepository from "../VoiceRepository.server";
import {
	VOICE_FREE_MINUTES_PER_MONTH,
	VOICE_MONTHLY_BUDGET_USD,
} from "../voice-constants";
import { requireVoiceDashboardAccess } from "../voice-utils.server";

const STATS_DAYS = 14;

export const loader = async () => {
	requireVoiceDashboardAccess();

	const since = dateToDatabaseTimestamp(subDays(new Date(), STATS_DAYS));

	const [
		settings,
		available,
		monthMinutes,
		adoption,
		platforms,
		leaveReasons,
		errorCounts,
		latestErrors,
		ratings,
		feedbackComments,
		liveRooms,
	] = await Promise.all([
		VoiceRepository.findSettings(),
		VoiceAvailability.isAvailable(),
		VoiceAvailability.monthParticipantMinutes(),
		VoiceRepository.findDailyAdoptionSince(since),
		VoiceRepository.findPlatformStatsSince(since),
		VoiceRepository.countLeaveReasonsSince(since),
		VoiceRepository.countClientErrorsSince(since),
		VoiceRepository.findLatestClientErrors(),
		VoiceRepository.countRatingsSince(since),
		VoiceRepository.findLatestFeedbackComments(),
		liveRoomsWithTypes(),
	]);

	return {
		statsDays: STATS_DAYS,
		isConfigured: Daily.isConfigured(),
		isDisabled: settings.isDisabled,
		available,
		cost: {
			monthMinutes,
			freeMinutes: VOICE_FREE_MINUTES_PER_MONTH,
			budgetUsd: VOICE_MONTHLY_BUDGET_USD,
			monthCostUsd: VoiceCost.monthlyCostUsd(monthMinutes),
			projectedCostUsd: VoiceCost.projectedMonthlyCostUsd({
				participantMinutes: monthMinutes,
				monthProgress: monthProgress(),
			}),
		},
		liveRooms,
		adoption,
		platforms,
		leaveReasons,
		errorCounts,
		latestErrors,
		ratings,
		feedbackComments,
	};
};

async function liveRoomsWithTypes() {
	const occupied = VoicePresence.allOccupiedRooms();
	const resolved = await ChatRoomResolver.resolveAll(
		occupied.map((room) => room.roomId),
	);

	return occupied.map((room) => ({
		...room,
		type: resolved.find((candidate) => candidate.roomId === room.roomId)?.type,
	}));
}

function monthProgress() {
	const now = new Date();
	const start = startOfMonth(now);

	return (
		differenceInSeconds(now, start) /
		differenceInSeconds(endOfMonth(now), start)
	);
}
