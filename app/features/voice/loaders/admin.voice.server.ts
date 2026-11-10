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
	VOICE_FEATURES,
	VOICE_FREE_MINUTES_PER_MONTH,
	VOICE_MONTHLY_BUDGET_USD,
} from "../voice-constants";
import { requireVoiceDashboardAccess } from "../voice-utils.server";

const STATS_DAYS = 14;

export const loader = async () => {
	requireVoiceDashboardAccess();

	const since = dateToDatabaseTimestamp(subDays(new Date(), STATS_DAYS));

	const settings = await VoiceRepository.findSettings();
	const available = await VoiceAvailability.isAvailable();
	const monthMinutes = await VoiceAvailability.monthParticipantMinutes();
	const monthMinutesByFeature =
		await VoiceRepository.sumParticipantMinutesByFeatureSince(
			dateToDatabaseTimestamp(startOfMonth(new Date())),
		);
	const adoption = await VoiceRepository.findDailyAdoptionSince(since);
	const playerAdoption = await VoiceRepository.findPlayerAdoptionSince(since);
	const voiceChatPreferences =
		await VoiceRepository.findVoiceChatPreferenceStatsSince(since);
	const platforms = await VoiceRepository.findPlatformStatsSince(since);
	const leaveReasons = await VoiceRepository.countLeaveReasonsSince(since);
	const errorCounts = await VoiceRepository.countClientErrorsSince(since);
	const latestErrors = await VoiceRepository.findLatestClientErrors();
	const ratings = await VoiceRepository.countRatingsSince(since);
	const feedbackComments = await VoiceRepository.findLatestFeedbackComments();
	const liveRooms = await liveRoomsWithTypes();

	return {
		statsDays: STATS_DAYS,
		isConfigured: Daily.isConfigured(),
		isDisabled: settings.isDisabled,
		available,
		features: VOICE_FEATURES.map((feature) => ({
			feature,
			isDisabled: settings.disabledFeatures.includes(feature),
			monthMinutes: monthMinutesByFeature[feature],
		})),
		cost: {
			monthMinutes,
			freeMinutes: VOICE_FREE_MINUTES_PER_MONTH,
			budgetUsd: VOICE_MONTHLY_BUDGET_USD,
			budgetMinutes: VoiceCost.budgetMinutes(),
			monthCostUsd: VoiceCost.monthlyCostUsd(monthMinutes),
			projectedCostUsd: VoiceCost.projectedMonthlyCostUsd({
				participantMinutes: monthMinutes,
				monthProgress: monthProgress(),
			}),
		},
		liveRooms,
		adoption,
		playerAdoption,
		voiceChatPreferences,
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
