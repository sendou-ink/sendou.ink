import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import * as SplatoonFaker from "../core/SplatoonFaker";

type InsertArgs = Parameters<typeof ReportedWeaponRepository.upsertOwn>[0] & {
	userId: number;
};

/** `userId` is whose weapon it was. `mapIndex` identifies the row so it is not defaulted, or a second weapon would replace the first. */
export const { createMany } = defineFactory({
	defaults: () => ({
		weaponSplId: SplatoonFaker.mainWeapon(),
	}),
	insert: ({ userId, ...args }: InsertArgs) =>
		actAs(userId, () => ReportedWeaponRepository.upsertOwn(args)),
});
