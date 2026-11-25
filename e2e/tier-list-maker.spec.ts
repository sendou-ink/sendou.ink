import * as DragIds from "~/features/tier-list-maker/core/DragIds";
import * as TierList from "~/features/tier-list-maker/core/TierList";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { TierListMakerPage } from "./pages/tier-list-maker/tier-list-maker-page";

const SPLATTERSHOT = "main-weapon:40";
const SPLATTERSHOT_COPY = "main-weapon:40:1";
const SPLAT_ROLLER = "main-weapon:1010";
const TENTATEK_SPLATTERSHOT = "main-weapon:41";
const HERO_SHOT_REPLICA = "main-weapon:45";
const SCORCH_GORGE = "stage:0";
const SCORCH_GORGE_SPLAT_ZONES = "stage-mode:0-SZ";
const SCORCH_GORGE_TURF_WAR = "stage-mode:0-TW";

test.describe("Tier list maker", () => {
	/**
	 * Items are dragged from the pool under the tiers into a tier, within it and back to the pool.
	 * In click to place mode clicking an item of the pool instead adds it to the end of the selected
	 * tier, the top one to begin with. Items of every type (main weapons, stages…) can share one list.
	 */
	test.describe("Placing items", () => {
		test("an item dragged into a tier leaves the pool", async ({ page }) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();

			await tierList.dragItemToTier(SPLATTERSHOT, "tier-s");

			expect(await tierList.tierItemIds("tier-s")).toEqual([SPLATTERSHOT]);
			await isNotVisible(tierList.poolItem(SPLATTERSHOT));
		});

		test("an item dragged back to the pool is taken out of its tier", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo(withItems({ "tier-x": [SPLATTERSHOT] }));

			await tierList.dragItemToPool(SPLATTERSHOT);

			await expect(tierList.tierItems("tier-x")).toHaveCount(0);
			await expect(tierList.poolItem(SPLATTERSHOT)).toBeVisible();
		});

		test("an item dragged onto another of its tier takes its place", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo(
				withItems({ "tier-x": [SPLATTERSHOT, SPLAT_ROLLER] }),
			);

			await tierList.dragItemOnto(SPLATTERSHOT, {
				tierId: "tier-x",
				onto: SPLAT_ROLLER,
			});

			await expect
				.poll(() => tierList.tierItemIds("tier-x"))
				.toEqual([SPLAT_ROLLER, SPLATTERSHOT]);
		});

		test("clicking items in click to place mode adds them to the selected tier", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();
			await tierList.setPlacementMode("click");
			await expect(tierList.locators.emptyTiersClickMode).toHaveCount(5);

			// the top tier is selected to begin with
			await tierList.clickItem(SPLATTERSHOT);

			expect(await tierList.tierItemIds("tier-x")).toEqual([SPLATTERSHOT]);

			await tierList.selectTier("tier-a");
			await tierList.clickItem(SPLAT_ROLLER);

			expect(await tierList.tierItemIds("tier-a")).toEqual([SPLAT_ROLLER]);
		});

		test("items of different types can be placed in the same list", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo(withItems({ "tier-x": [SPLATTERSHOT] }));

			await tierList.openTab("stage");
			await tierList.dragItemToTier(SCORCH_GORGE, "tier-s");

			expect(await tierList.tierItemIds("tier-x")).toEqual([SPLATTERSHOT]);
			expect(await tierList.tierItemIds("tier-s")).toEqual([SCORCH_GORGE]);
		});
	});

	/**
	 * The pool leaves out the items already placed, unless "No duplicates" is turned off: then a
	 * placed item is offered again as a new copy. Alt kits and alt skins can be hidden from the main
	 * weapons, and the Stage + Modes pool only offers the modes switched on, the ranked modes to begin with.
	 */
	test.describe("Item pool", () => {
		test("with duplicates allowed a placed item is offered again as a copy", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo(withItems({ "tier-x": [SPLATTERSHOT] }));
			await isNotVisible(tierList.poolItem(SPLATTERSHOT));

			await tierList.toggle("noDuplicates");
			await tierList.dragItemToTier(SPLATTERSHOT_COPY, "tier-s");

			expect(await tierList.tierItemIds("tier-x")).toEqual([SPLATTERSHOT]);
			expect(await tierList.tierItemIds("tier-s")).toEqual([SPLATTERSHOT_COPY]);
		});

		test("alt kits and alt skins can be hidden from the main weapons", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();

			await tierList.toggle("hideAltKits");

			await isNotVisible(tierList.poolItem(TENTATEK_SPLATTERSHOT));
			await expect(tierList.poolItem(HERO_SHOT_REPLICA)).toBeVisible();

			await tierList.toggle("hideAltSkins");

			await isNotVisible(tierList.poolItem(HERO_SHOT_REPLICA));
			await expect(tierList.poolItem(SPLATTERSHOT)).toBeVisible();
		});

		test("stage + modes are offered only for the modes switched on", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();
			await tierList.openTab("stage-mode");

			await expect(tierList.poolItem(SCORCH_GORGE_SPLAT_ZONES)).toBeVisible();
			await isNotVisible(tierList.poolItem(SCORCH_GORGE_TURF_WAR));

			await tierList.toggleMode("Turf War");

			await expect(tierList.poolItem(SCORCH_GORGE_TURF_WAR)).toBeVisible();
		});
	});

	/**
	 * A tier list starts with the tiers X, S, A, B and C. Tiers are added to the bottom, renamed,
	 * recolored and deleted from the editor their label opens, a deleted tier's items going back to
	 * the pool, and reordered by dragging their handle. The labels can be hidden, leaving only the items.
	 */
	test.describe("Tiers", () => {
		test("a new tier is added to the bottom", async ({ page }) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();

			await tierList.addTier();

			const tierIds = await tierList.tierIds();
			expect(tierIds).toHaveLength(6);
			await expect(tierList.tierLabel("New")).toBeVisible();
			expect(tierIds.slice(0, 5)).toEqual([
				"tier-x",
				"tier-s",
				"tier-a",
				"tier-b",
				"tier-c",
			]);
		});

		test("a tier is renamed and recolored from its label", async ({ page }) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();

			await tierList.editTier("S");
			await tierList.renameTier("Great");
			await tierList.pickTierColor("#4169e1");
			await page.keyboard.press("Escape");

			await expect(tierList.tierLabel("Great")).toHaveCSS(
				"background-color",
				"rgb(65, 105, 225)",
			);
			await isNotVisible(tierList.tierLabel("S"));
		});

		test("deleting a tier puts its items back in the pool", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo(withItems({ "tier-x": [SPLATTERSHOT] }));

			await tierList.editTier("X");
			await tierList.deleteTier();

			expect(await tierList.tierIds()).toEqual([
				"tier-s",
				"tier-a",
				"tier-b",
				"tier-c",
			]);
			await expect(tierList.poolItem(SPLATTERSHOT)).toBeVisible();
		});

		test("tiers are reordered by dragging their handle", async ({ page }) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();

			await tierList.dragTier({ from: 0, to: 2 });

			expect(await tierList.tierIds()).toEqual([
				"tier-s",
				"tier-a",
				"tier-x",
				"tier-b",
				"tier-c",
			]);
		});

		test("hiding the tier headers leaves only the items", async ({ page }) => {
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo(withItems({ "tier-x": [SPLATTERSHOT] }));

			await tierList.toggle("showTierHeaders");

			await isNotVisible(tierList.tierLabel("X"));
			expect(await tierList.tierItemIds("tier-x")).toEqual([SPLATTERSHOT]);
		});
	});

	/**
	 * The whole tier list (tiers, items, title and the pool's settings) lives in the page's URL, so a
	 * reload or a shared link brings it back; the placement mode is remembered on the device instead.
	 * Resetting brings back the default tiers with nothing placed. The exported image shows the title
	 * and, for a logged in user, their name, with a QR code linking back to the list.
	 */
	test.describe("Saving and sharing", () => {
		test("the tier list is restored after a reload", async ({ page }) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();
			await tierList.dragItemToTier(SPLATTERSHOT, "tier-s");
			await tierList.dragTier({ from: 0, to: 2 });

			await tierList.reload();

			expect(await tierList.tierIds()).toEqual([
				"tier-s",
				"tier-a",
				"tier-x",
				"tier-b",
				"tier-c",
			]);
			expect(await tierList.tierItemIds("tier-s")).toEqual([SPLATTERSHOT]);
		});

		test("the placement mode is remembered across visits", async ({ page }) => {
			const tierList = new TierListMakerPage(page);
			await tierList.goto();
			await tierList.setPlacementMode("click");

			await tierList.goto();

			await expect(tierList.locators.emptyTiersClickMode).toHaveCount(5);
		});

		test("resetting brings back the default tiers with nothing placed", async ({
			page,
		}) => {
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo({
				tiers: [{ id: "tier-great", name: "Great", color: "#4169e1" }],
				tierItems: new Map([["tier-great", [item(SPLATTERSHOT)]]]),
			});

			await tierList.reset();

			expect(await tierList.tierIds()).toEqual([
				"tier-x",
				"tier-s",
				"tier-a",
				"tier-b",
				"tier-c",
			]);
			await expect(tierList.locators.emptyTiersDragMode).toHaveCount(5);
		});

		test("the exported image shows the title and who made it", async ({
			page,
		}) => {
			await impersonate(page);
			const tierList = new TierListMakerPage(page);
			await tierList.openLinkTo(withItems({ "tier-x": [SPLATTERSHOT] }));

			await tierList.openExportDialog();
			await tierList.setExportTitle("Shooters ranked");

			await expect(tierList.exportDialogText("Shooters ranked")).toBeVisible();
			await expect(tierList.exportDialogText("Made by")).toBeVisible();
			await expect(tierList.exportDialogText("Sendou")).toBeVisible();
		});
	});
});

/** The default tiers with the given items (drag ids like `main-weapon:40`) placed in them. */
function withItems(tierItems: Record<string, string[]>) {
	let state = TierList.empty();
	for (const [tierId, itemIds] of Object.entries(tierItems)) {
		for (const itemId of itemIds) {
			state = TierList.addItem(state, tierId, item(itemId));
		}
	}

	return state;
}

function item(itemId: string) {
	const parsed = DragIds.parseItemId(itemId);
	if (!parsed) throw new Error(`Not an item id: ${itemId}`);

	return parsed;
}
