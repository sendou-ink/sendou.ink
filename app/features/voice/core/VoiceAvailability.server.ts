import { startOfMonth } from "date-fns";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as VoiceRepository from "../VoiceRepository.server";
import type { VoiceFeature } from "../voice-constants";
import * as Daily from "./Daily.server";
import * as VoiceCost from "./VoiceCost";

const CACHE_MS = 60_000;

let cached: {
	isOverBudget: boolean;
	settings: Awaited<ReturnType<typeof VoiceRepository.findSettings>>;
	checkedAt: number;
} | null = null;

export async function isAvailable(feature?: VoiceFeature) {
	if (!Daily.isConfigured()) return false;

	const { settings, isOverBudget } = await cachedState();
	if (settings.isDisabled || isOverBudget) return false;

	return !feature || !settings.disabledFeatures.includes(feature);
}

export function clearCache() {
	cached = null;
}

export function monthParticipantMinutes() {
	return VoiceRepository.sumParticipantMinutesSince(
		dateToDatabaseTimestamp(startOfMonth(new Date())),
	);
}

async function cachedState() {
	if (cached && Date.now() - cached.checkedAt < CACHE_MS) return cached;

	const settings = await VoiceRepository.findSettings();
	const minutes = await monthParticipantMinutes();
	cached = {
		settings,
		isOverBudget: VoiceCost.isOverBudget(minutes),
		checkedAt: Date.now(),
	};

	return cached;
}
