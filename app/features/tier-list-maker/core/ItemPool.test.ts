import { describe, expect, test } from "vitest";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import type { TierListItem } from "../tier-list-maker-schemas";
import * as ItemPool from "./ItemPool";
import * as TierList from "./TierList";

const SPLATTERSHOT_ID = 40;
const TENTATEK_SPLATTERSHOT_ID = 41;
const HERO_SHOT_REPLICA_ID = 45;

const splattershot: TierListItem = { type: "main-weapon", id: SPLATTERSHOT_ID };

const DEFAULTS = {
	state: TierList.empty(),
	type: "main-weapon",
	canAddDuplicates: false,
	hideAltKits: false,
	hideAltSkins: false,
	modes: ["SZ", "TC", "RM", "CB"],
} satisfies Parameters<typeof ItemPool.items>[0];

describe("ItemPool.items", () => {
	test("offers every item of the type in game order", () => {
		const items = ItemPool.items(DEFAULTS);

		expect(items.map((item) => item.id)).toEqual([...mainWeaponIds]);
	});

	test("leaves out a placed item", () => {
		const state = TierList.addItem(TierList.empty(), "tier-x", splattershot);

		const items = ItemPool.items({ ...DEFAULTS, state });

		expect(itemIds(items)).not.toContain(SPLATTERSHOT_ID);
	});

	test("offers a placed item again as a new copy when duplicates are allowed", () => {
		const state = TierList.addItem(TierList.empty(), "tier-x", splattershot);

		const items = ItemPool.items({
			...DEFAULTS,
			state,
			canAddDuplicates: true,
		});

		expect(items).toContainEqual({ ...splattershot, nth: 1 });
	});

	test("numbers a new copy after the highest copy in any tier", () => {
		let state = TierList.addItem(TierList.empty(), "tier-x", splattershot);
		state = TierList.addItem(state, "tier-s", { ...splattershot, nth: 2 });

		const items = ItemPool.items({
			...DEFAULTS,
			state,
			canAddDuplicates: true,
		});

		expect(items).toContainEqual({ ...splattershot, nth: 3 });
	});

	test.each([
		{
			why: "alt kits",
			filter: { hideAltKits: true },
			hidden: TENTATEK_SPLATTERSHOT_ID,
			kept: HERO_SHOT_REPLICA_ID,
		},
		{
			why: "alt skins",
			filter: { hideAltSkins: true },
			hidden: HERO_SHOT_REPLICA_ID,
			kept: TENTATEK_SPLATTERSHOT_ID,
		},
	])("hides $why of the main weapons", ({ filter, hidden, kept }) => {
		const items = itemIds(ItemPool.items({ ...DEFAULTS, ...filter }));

		expect(items).not.toContain(hidden);
		expect(items).toContain(kept);
		expect(items).toContain(SPLATTERSHOT_ID);
	});

	test("hides alt kits even when a copy of them could be added", () => {
		const tentatek: TierListItem = {
			type: "main-weapon",
			id: TENTATEK_SPLATTERSHOT_ID,
		};
		const state = TierList.addItem(TierList.empty(), "tier-x", tentatek);

		const items = ItemPool.items({
			...DEFAULTS,
			state,
			canAddDuplicates: true,
			hideAltKits: true,
		});

		expect(itemIds(items)).not.toContain(TENTATEK_SPLATTERSHOT_ID);
	});

	test("offers stage + mode pairs only for the selected modes", () => {
		const items = ItemPool.items({
			...DEFAULTS,
			type: "stage-mode",
			modes: ["SZ", "TW"],
		});

		expect(items).toHaveLength(stageIds.length * 2);
		expect(items[0]).toEqual({ type: "stage-mode", id: `${stageIds[0]}-TW` });
		expect(items[1]).toEqual({ type: "stage-mode", id: `${stageIds[0]}-SZ` });
	});
});

function itemIds(items: TierListItem[]) {
	return items.map((item) => item.id);
}
