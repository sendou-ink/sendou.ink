import { z } from "zod";
import { _action, weaponSplId } from "~/utils/zod";

const reportedMapIndex = z.coerce.number().int().nonnegative();

export const reportWeaponSchema = z.object({
	_action: _action("REPORT_WEAPON"),
	weaponSplId,
	mapIndex: reportedMapIndex,
});

export const undoWeaponReportSchema = z.object({
	_action: _action("UNDO_WEAPON_REPORT"),
	mapIndex: reportedMapIndex,
});

/** Weapon reporting actions shared by every match page route action schema. */
export const weaponReportActionSchema = z.union([
	reportWeaponSchema,
	undoWeaponReportSchema,
]);
