import type { SQMatchGroup } from "~/features/sendouq/core/SendouQ.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type * as ReportedWeaponRepository from "../ReportedWeaponRepository.server";
import type * as SQMatchRepository from "../SQMatchRepository.server";

export type ReportedWeaponForMerging = {
	weaponSplId?: MainWeaponId;
	mapIndex: number;
	groupMatchMapId: number;
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

	// make corrections to the old weapons
	for (const oldWeapon of oldWeapons) {
		const replacement = newWeapons.find(
			(newWeapon) =>
				newWeapon.groupMatchMapId === oldWeapon.groupMatchMapId &&
				newWeapon.userId === oldWeapon.userId,
		);

		if (replacement) {
			result.push(replacement);
		} else {
			result.push(oldWeapon);
		}
	}

	// add new weapons that were not reported in the old list
	for (const newWeapon of newWeapons) {
		if (
			!result.some(
				(oldWeapon) =>
					newWeapon.groupMatchMapId === oldWeapon.groupMatchMapId &&
					newWeapon.userId === oldWeapon.userId,
			)
		) {
			result.push(newWeapon);
		}
	}

	// if the score got adjusted we need to get rid of the extra reported weapons
	if (newReportedMapsCount) {
		result = result.filter((wpn) => wpn.mapIndex < newReportedMapsCount);
	}

	return result.flatMap((w) =>
		typeof w.weaponSplId === "number" ? [w as ReportedWeapon] : [],
	);
}

export function reportedWeaponsToArrayOfArrays({
	reportedWeapons,
	mapList,
	groupAlpha,
	groupBravo,
}: {
	reportedWeapons: Awaited<
		ReturnType<typeof ReportedWeaponRepository.findByMatchId>
	>;
	mapList: NonNullable<
		Awaited<ReturnType<typeof SQMatchRepository.findById>>
	>["mapList"];
	groupAlpha: SQMatchGroup;
	groupBravo: SQMatchGroup;
}) {
	if (!reportedWeapons) return null;

	const result: (MainWeaponId | null)[][] = [];

	const allMembers = [...groupAlpha.members, ...groupBravo.members].map(
		(m) => m.id,
	);

	for (const map of mapList) {
		const mapWeapons: (MainWeaponId | null)[] = [];

		for (const userId of allMembers) {
			const reportedWeapon = reportedWeapons.find(
				(wpn) => wpn.groupMatchMapId === map.id && wpn.userId === userId,
			);

			mapWeapons.push(reportedWeapon ? reportedWeapon.weaponSplId : null);
		}

		result.push(mapWeapons);
	}

	return result;
}
