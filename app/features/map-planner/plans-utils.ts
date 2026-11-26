import { format } from "date-fns";
import { stagesObj } from "~/modules/in-game-lists/stage-ids";
import type { PlanDocument } from "./core/PlanDocument";

/** Name of a downloaded plan file or image without the extension, e.g. `plan-sturgeon-shipyard-SZ-2026-11-21`. */
export function planFileName(document: PlanDocument, date: Date) {
	const stageKey = Object.entries(stagesObj).find(
		([, stageId]) => stageId === document.stageId,
	)?.[0];
	const stage = (stageKey ?? String(document.stageId))
		.toLowerCase()
		.replaceAll("_", "-");

	return `plan-${stage}-${document.objective.mode}-${format(date, "yyyy-MM-dd")}`;
}
