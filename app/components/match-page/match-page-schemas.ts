import * as v from "valibot";
import { _action, coerceNumber, weaponSplId } from "~/utils/schema";

const reportedMapIndex = v.pipe(coerceNumber(), v.integer(), v.minValue(0));

export const reportWeaponSchema = v.object({
	_action: _action("REPORT_WEAPON"),
	weaponSplId,
	mapIndex: reportedMapIndex,
});

export const undoWeaponReportSchema = v.object({
	_action: _action("UNDO_WEAPON_REPORT"),
	mapIndex: reportedMapIndex,
});

/** Weapon reporting actions shared by every match page route action schema. */
export const weaponReportActionSchema = v.union([
	reportWeaponSchema,
	undoWeaponReportSchema,
]);
