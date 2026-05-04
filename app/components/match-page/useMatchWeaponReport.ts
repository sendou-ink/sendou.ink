import { useFetcher } from "react-router";
import { useRecentlyReportedWeapons } from "~/hooks/useRecentlyReportedWeapons";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { WeaponReporterProps } from "./WeaponReporter";

/**
 * Wires the `<WeaponReporter />` component to the standard
 * `REPORT_WEAPON` / `UNDO_WEAPON_REPORT` fetcher actions and to the
 * locally persisted recently-reported weapons list.
 *
 * `maps` is the play order of maps the viewer can report a weapon for and
 * `pastReported` is the weapons the viewer has already reported, paired
 * with the `mapIndex` they were reported for.
 */
export function useMatchWeaponReport({
	maps,
	pastReported,
}: {
	maps: { stageId: StageId; mode: ModeShort }[];
	pastReported: { mapIndex: number; weaponSplId: MainWeaponId }[];
}): WeaponReporterProps {
	const weaponFetcher = useFetcher();
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const reportedMapIndexes = new Set(pastReported.map((w) => w.mapIndex));
	const nextMapIndex = (() => {
		for (let i = 0; i < maps.length; i++) {
			if (!reportedMapIndexes.has(i)) return i;
		}
		return -1;
	})();
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
