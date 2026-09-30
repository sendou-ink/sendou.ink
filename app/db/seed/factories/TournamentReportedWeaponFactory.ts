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
 * `createdAt` is an argument of the write itself: reporting stays open long after, so the app stamps the
 * tournament's start instead of now. `mapIndex` is not defaulted, see `SQReportedWeaponFactory`.
 */
export const { createMany } = defineFactory({
	defaults: () => ({
		weaponSplId: SplatoonFaker.mainWeapon(),
	}),
	insert: ({ userId, ...args }: InsertArgs) =>
		actAs(userId, () => ReportedWeaponRepository.upsertOwnTournament(args)),
});
