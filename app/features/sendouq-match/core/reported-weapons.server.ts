import type { MainWeaponId } from "~/modules/in-game-lists/types";

export type ReportedWeaponForMerging = {
	weaponSplId?: MainWeaponId;
	mapIndex: number;
	groupMatchId: number;
	userId: number;
};
type ReportedWeapon = ReportedWeaponForMerging & { weaponSplId: MainWeaponId };
export function mergeReportedWeapons({
	newWeapons,
	oldWeapons,
	newReportedMapsCount,
}: {
	newWeapons: ReportedWeaponForMerging[];
	oldWeapons: ReportedWeaponForMerging[];
	newReportedMapsCount?: number;
}): ReportedWeapon[] {
	let result: ReportedWeaponForMerging[] = [];

	for (const oldWeapon of oldWeapons) {
		const replacement = newWeapons.find(
			(newWeapon) =>
				newWeapon.groupMatchId === oldWeapon.groupMatchId &&
				newWeapon.mapIndex === oldWeapon.mapIndex &&
				newWeapon.userId === oldWeapon.userId,
		);

		if (replacement) {
			result.push(replacement);
		} else {
			result.push(oldWeapon);
		}
	}

	for (const newWeapon of newWeapons) {
		if (
			!result.some(
				(oldWeapon) =>
					newWeapon.groupMatchId === oldWeapon.groupMatchId &&
					newWeapon.mapIndex === oldWeapon.mapIndex &&
					newWeapon.userId === oldWeapon.userId,
			)
		) {
			result.push(newWeapon);
		}
	}

	// an adjusted score leaves extra reported weapons behind
	if (newReportedMapsCount) {
		result = result.filter((wpn) => wpn.mapIndex < newReportedMapsCount);
	}

	return result.flatMap((w) =>
		typeof w.weaponSplId === "number" ? [w as ReportedWeapon] : [],
	);
}
