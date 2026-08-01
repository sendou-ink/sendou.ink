import { useFetcher } from "react-router";
import { useRecentlyReportedWeapons } from "~/hooks/useRecentlyReportedWeapons";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { WeaponReporterMap, WeaponReporterProps } from "./WeaponReporter";

/**
 * Wires the `<WeaponReporter />` component to the standard
 * `REPORT_WEAPON` / `UNDO_WEAPON_REPORT` fetcher actions and to the
 * locally persisted recently-reported weapons list.
 *
 * `maps` is the maps the viewer can report a weapon for, in play order, each
 * carrying its `mapIndex` in the match's map list — a viewer who sat out a map
 * simply has no entry for it. `pastReported` is the weapons the viewer has
 * already reported, paired with the `mapIndex` they were reported for.
 */
export function useMatchWeaponReport({
	maps,
	pastReported,
}: {
	maps: WeaponReporterMap[];
	pastReported: { mapIndex: number; weaponSplId: MainWeaponId }[];
}): WeaponReporterProps {
	const weaponFetcher = useFetcher();
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
		isSubmitting: weaponFetcher.state !== "idle",
		onSubmit: (weaponSplId) => {
			addRecentlyReportedWeapon(weaponSplId);
			if (nextMapIndex < 0) return;
			weaponFetcher.submit(
				{
					_action: "REPORT_WEAPON",
					weaponSplId: String(weaponSplId),
					mapIndex: String(nextMapIndex),
				},
				{ method: "post" },
			);
		},
		onUndo: () => {
			if (undoMapIndex < 0) return;
			weaponFetcher.submit(
				{
					_action: "UNDO_WEAPON_REPORT",
					mapIndex: String(undoMapIndex),
				},
				{ method: "post" },
			);
		},
	};
}
