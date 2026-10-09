import { startOfMonth } from "date-fns";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as VoiceRepository from "../VoiceRepository.server";
import * as Daily from "./Daily.server";
import * as VoiceCost from "./VoiceCost";

const CACHE_MS = 60_000;

let cached: { available: boolean; checkedAt: number } | null = null;

export async function isAvailable() {
	if (!Daily.isConfigured()) return false;
	if (cached && Date.now() - cached.checkedAt < CACHE_MS) {
		return cached.available;
	}

	const [settings, minutes] = await Promise.all([
		VoiceRepository.findSettings(),
		monthParticipantMinutes(),
	]);
	const available = !settings.isDisabled && !VoiceCost.isOverBudget(minutes);
	cached = { available, checkedAt: Date.now() };

	return available;
}

export function clearCache() {
	cached = null;
}

export function monthParticipantMinutes() {
	return VoiceRepository.sumParticipantMinutesSince(
		dateToDatabaseTimestamp(startOfMonth(new Date())),
	);
}
