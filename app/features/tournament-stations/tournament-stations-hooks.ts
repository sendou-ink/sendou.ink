import { useTranslation } from "react-i18next";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useHydrated } from "~/hooks/useHydrated";
import type { EtaRange } from "./core/EtaSimulation";
import * as StartsIn from "./core/StartsIn";

/** Minute ticks on the clock's full minutes. */
const MINUTE_TICKS = { alignTo: new Date(0) };

/**
 * Estimated time until the match starts as text e.g. "~15–25 min", counted down every minute. `null` when it's due
 * now, too far out to show or before hydration (the server's clock is not the viewer's).
 */
export function useStartsInText(eta: EtaRange | null | undefined) {
	const formatStartsIn = useFormatStartsIn();
	const now = useAutoRerender("minute", MINUTE_TICKS);
	const isHydrated = useHydrated();

	if (!eta || !isHydrated) return null;

	const minutes = StartsIn.minutesFromNow(eta, now.getTime());
	if (!minutes || minutes.max === 0) return null;

	return formatStartsIn(minutes);
}

/** Formats minutes until a match starts ({@link StartsIn.minutesFromNow}) e.g. "~15–25 min". */
export function useFormatStartsIn() {
	const { t } = useTranslation(["common"]);

	return (minutes: { min: number; max: number }) =>
		minutes.min === minutes.max
			? t("common:startsIn.exact", { minutes: minutes.max })
			: t("common:startsIn.range", minutes);
}
