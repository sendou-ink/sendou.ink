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
 * `pastReported` is the weapons the viewer has already reported, in order.
 */
export function useMatchWeaponReport({
	maps,
	pastReported,
}: {
	maps: { stageId: StageId; mode: ModeShort }[];
	pastReported: MainWeaponId[];
}): WeaponReporterProps {
	const weaponFetcher = useFetcher();
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	return {
		maps,
		pastReported,
		quickSelectWeaponIds: recentlyReportedWeapons,
		isSubmitting: weaponFetcher.state !== "idle",
		onSubmit: (weaponSplId) => {
			addRecentlyReportedWeapon(weaponSplId);
			const mapIndex = pastReported.length;
			if (!maps[mapIndex]) return;
			weaponFetcher.submit(
				{
					_action: "REPORT_WEAPON",
					weaponSplId: String(weaponSplId),
					mapIndex: String(mapIndex),
				},
				{ method: "post" },
			);
		},
		onUndo: () => {
			const mapIndex = pastReported.length - 1;
			if (mapIndex < 0) return;
			weaponFetcher.submit(
				{
					_action: "UNDO_WEAPON_REPORT",
					mapIndex: String(mapIndex),
				},
				{ method: "post" },
			);
		},
	};
}
