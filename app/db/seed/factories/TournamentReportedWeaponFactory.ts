import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import * as SplatoonFaker from "../core/SplatoonFaker";

type InsertArgs = Parameters<
	typeof ReportedWeaponRepository.upsertOwnTournament
>[0] & {
	/** The player whose weapon it was, on whose behalf it is reported. */
	userId: number;
};

/**
 * Creates the weapons a tournament match's players report having used. `createdAt`
 * is an argument of the write itself: reporting is open long after the games were
 * played, so the app stamps the weapon with the tournament's start instead of now.
 *
 * `mapIndex` is not defaulted, for the same reason it is not in `SQReportedWeaponFactory`.
 */
export const { createMany } = defineFactory({
	defaults: () => ({
		weaponSplId: SplatoonFaker.mainWeapon(),
	}),
	insert: ({ userId, ...args }: InsertArgs) =>
		actAs(userId, () => ReportedWeaponRepository.upsertOwnTournament(args)),
});
