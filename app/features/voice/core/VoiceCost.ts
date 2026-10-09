import {
	VOICE_FREE_MINUTES_PER_MONTH,
	VOICE_MONTHLY_BUDGET_USD,
	VOICE_PRICE_PER_MINUTE_USD,
} from "../voice-constants";

export function monthlyCostUsd(participantMinutes: number) {
	const billable = Math.max(
		0,
		participantMinutes - VOICE_FREE_MINUTES_PER_MONTH,
	);

	return billable * VOICE_PRICE_PER_MINUTE_USD;
}

export function isOverBudget(participantMinutes: number) {
	return monthlyCostUsd(participantMinutes) >= VOICE_MONTHLY_BUDGET_USD;
}

export function projectedMonthlyCostUsd({
	participantMinutes,
	monthProgress,
}: {
	participantMinutes: number;
	monthProgress: number;
}) {
	if (monthProgress <= 0) return 0;

	return monthlyCostUsd(participantMinutes / monthProgress);
}
