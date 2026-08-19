import * as v from "valibot";
import { _action, weaponSplId } from "~/utils/zod";

const reportedMapIndex = v.pipe(v.unknown(), v.toNumber(), v.integer(), v.minValue(0));

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
