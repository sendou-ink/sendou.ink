import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import * as SplatoonFaker from "../core/SplatoonFaker";

type InsertArgs = Parameters<typeof ReportedWeaponRepository.upsertOwn>[0] & {
	userId: number;
};

/**
 * Creates the weapons a SendouQ match's players report having used. `userId` is the
 * player whose weapon it was, on whose behalf it is reported.
 *
 * `mapIndex` is not defaulted: it is what identifies the row, so a second weapon
 * without one would replace the first rather than add to it.
 */
export const { createMany } = defineFactory({
	defaults: () => ({
		weaponSplId: SplatoonFaker.mainWeapon(),
	}),
	insert: ({ userId, ...args }: InsertArgs) =>
		actAs(userId, () => ReportedWeaponRepository.upsertOwn(args)),
});
