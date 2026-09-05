import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useRecentlyReportedWeapons } from "~/hooks/useRecentlyReportedWeapons";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponReportActionSchema } from "./match-page-schemas";
import type { WeaponReporterMap, WeaponReporterProps } from "./WeaponReporter";

/**
 * Wires `<WeaponReporter />` to the `REPORT_WEAPON` / `UNDO_WEAPON_REPORT` actions and the
 * locally persisted recently-reported list. `maps` are the maps the viewer can report for, in
 * play order with their `mapIndex` in the match's map list (sat out maps have no entry).
 */
export function useMatchWeaponReport({
	maps,
	pastReported,
}: {
	maps: WeaponReporterMap[];
	pastReported: { mapIndex: number; weaponSplId: MainWeaponId }[];
}): WeaponReporterProps {
	const weaponReport = useActionSubmit(weaponReportActionSchema);
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const reportedMapIndexes = new Set(pastReported.map((w) => w.mapIndex));
	const nextMapIndex =
		maps.find((map) => !reportedMapIndexes.has(map.mapIndex))?.mapIndex ?? -1;
	const undoMapIndex = pastReported.reduce(
		(max, w) => Math.max(max, w.mapIndex),
		-1,
	);

	return {
		maps,
		pastReported: [...pastReported]
			.sort((a, b) => a.mapIndex - b.mapIndex)
			.map((w) => w.weaponSplId),
		nextMapIndex,
		quickSelectWeaponIds: recentlyReportedWeapons,
		isSubmitting: weaponReport.state !== "idle",
		onSubmit: (weaponSplId) => {
			addRecentlyReportedWeapon(weaponSplId);
			if (nextMapIndex < 0) return;
			weaponReport.submit("REPORT_WEAPON", {
				weaponSplId,
				mapIndex: nextMapIndex,
			});
		},
		onUndo: () => {
			if (undoMapIndex < 0) return;
			weaponReport.submit("UNDO_WEAPON_REPORT", { mapIndex: undoMapIndex });
		},
	};
}
