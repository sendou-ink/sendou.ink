import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as FeedWeaponTrends from "./FeedWeaponTrends";

const PLAYER_COUNT = 100;

describe("FeedWeaponTrends.risersAndFallers", () => {
	test("returns null when a week has too few players", () => {
		const week = players({ count: 10, weaponSplId: 0 });

		expect(
			FeedWeaponTrends.risersAndFallers({
				thisWeek: week,
				lastWeek: week,
				ordinals: new Map(),
			}),
		).toBeNull();
	});

	test("counts each player once no matter how many maps they played", () => {
		const lastWeek = players({ count: PLAYER_COUNT, weaponSplId: 0 });
		const thisWeek = players({ count: PLAYER_COUNT, weaponSplId: 0 });
		thisWeek[0] = { userId: 0, weaponSplId: 10, count: 1000 };
		thisWeek[1] = { userId: 1, weaponSplId: 10, count: 1 };
		thisWeek[2] = { userId: 2, weaponSplId: 10, count: 1 };

		expect(
			FeedWeaponTrends.risersAndFallers({
				thisWeek,
				lastWeek,
				ordinals: new Map(),
			})?.rising,
		).toEqual([
			{ weaponSplId: 10, sharePercentage: 3, changePercentage: null },
		]);
	});

	test("weighs higher ranked players more", () => {
		const lastWeek = players({ count: PLAYER_COUNT, weaponSplId: 0 });
		const thisWeek = players({ count: PLAYER_COUNT, weaponSplId: 0 });
		for (const userId of [0, 1, 2, 3, 4]) {
			thisWeek[userId] = { userId, weaponSplId: 10, count: 1 };
		}
		const ordinals = new Map(
			Array.from({ length: PLAYER_COUNT }, (_, userId) => [userId, userId]),
		);
		const reversedOrdinals = new Map(
			Array.from({ length: PLAYER_COUNT }, (_, userId) => [userId, -userId]),
		);

		const highRankedShare = FeedWeaponTrends.risersAndFallers({
			thisWeek,
			lastWeek,
			ordinals: reversedOrdinals,
		})?.rising[0].sharePercentage;
		const lowRankedShare = FeedWeaponTrends.risersAndFallers({
			thisWeek,
			lastWeek,
			ordinals,
		})?.rising[0].sharePercentage;

		expect(highRankedShare).toBeGreaterThan(lowRankedShare!);
	});

	test("finds a weapon that fell below the minimum share", () => {
		const lastWeek = [
			...players({ count: 90, weaponSplId: 0 }),
			...players({ count: 10, weaponSplId: 10, firstUserId: 90 }),
		];
		const thisWeek = [
			...players({ count: 90, weaponSplId: 20 }),
			...players({ count: 10, weaponSplId: 0, firstUserId: 90 }),
		];

		expect(
			FeedWeaponTrends.risersAndFallers({
				thisWeek,
				lastWeek,
				ordinals: new Map(),
			})?.falling.map((trend) => trend.weaponSplId),
		).toEqual([10, 0]);
	});

	test("leaves out moves smaller than a percentage point", () => {
		const lastWeek = [
			...players({ count: 196, weaponSplId: 0 }),
			...players({ count: 4, weaponSplId: 10, firstUserId: 196 }),
		];
		const thisWeek = [
			...players({ count: 195, weaponSplId: 0 }),
			...players({ count: 5, weaponSplId: 10, firstUserId: 195 }),
		];

		expect(
			FeedWeaponTrends.risersAndFallers({
				thisWeek,
				lastWeek,
				ordinals: new Map(),
			}),
		).toBeNull();
	});
});

function players({
	count,
	weaponSplId,
	firstUserId = 0,
}: {
	count: number;
	weaponSplId: MainWeaponId;
	firstUserId?: number;
}): FeedWeaponTrends.WeaponPicks[] {
	return Array.from({ length: count }, (_, index) => ({
		userId: firstUserId + index,
		weaponSplId,
		count: 3,
	}));
}
