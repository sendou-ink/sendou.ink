import type { Page } from "@playwright/test";
import type { TierListState } from "~/features/tier-list-maker/tier-list-maker-schemas";
import { tierListMakerSearchParams } from "~/features/tier-list-maker/tier-list-maker-search-params";
import { TIER_LIST_MAKER_URL } from "~/utils/urls";
import {
	dragAndDrop,
	expect,
	expectIsHydrated,
	navigate,
} from "../../helpers/playwright";

type ItemType =
	| "main-weapon"
	| "sub-weapon"
	| "special-weapon"
	| "stage"
	| "mode"
	| "stage-mode"
	| "ability";

type Toggle =
	| "noDuplicates"
	| "showTierHeaders"
	| "hideAltKits"
	| "hideAltSkins";

const TAB_NAMES: Record<ItemType, string> = {
	"main-weapon": "Main Weapons",
	"sub-weapon": "Sub Weapons",
	"special-weapon": "Special Weapons",
	stage: "Stages",
	mode: "Modes",
	"stage-mode": "Stage + Modes",
	ability: "Abilities",
};

const TOGGLE_NAMES: Record<Toggle, string> = {
	noDuplicates: "No duplicates",
	showTierHeaders: "Show tier headers",
	hideAltKits: "Hide alt kits",
	hideAltSkins: "Hide alt skins",
};

/** The tier list maker page `/tier-list-maker`. Items are addressed by their drag id (`main-weapon:40`), tiers by their id (`tier-x`). */
export class TierListMakerPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			emptyTiersDragMode: page.getByText("Drop items here"),
			emptyTiersClickMode: page.getByText("Click items to add here"),
			tierDragHandles: page.getByRole("button", { name: "Reorder tier" }),
			addTierButton: page.getByRole("button", { name: "Add tier" }),
			tierEditor: page.getByRole("dialog").filter({ hasText: "Editing tier" }),
			exportDialog: page.getByRole("dialog").filter({
				has: page.getByRole("button", { name: "Download" }),
			}),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: TIER_LIST_MAKER_URL });
	}

	/** Opens the link of a tier list, which carries the whole list in its `state` search param. */
	async openLinkTo(state: TierListState) {
		await navigate({
			page: this.page,
			url: tierListMakerSearchParams.href(TIER_LIST_MAKER_URL, { state }),
		});
	}

	/** The tier list state lives in the url, so a reload restores it. */
	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	poolItem(itemId: string) {
		return this.page
			.getByRole("tabpanel")
			.locator(`[data-item-id="${itemId}"]`);
	}

	/** Items placed in the tier, left to right. */
	tierItems(tierId: string) {
		return this.tier(tierId).locator("[data-item-id]");
	}

	/** The label of the tier with the given name, showing its name and color. */
	tierLabel(name: string) {
		return this.page
			.locator("[data-tier-id]")
			.getByRole("button", { name, exact: true });
	}

	/** Ids of the items placed in the tier, left to right. */
	async tierItemIds(tierId: string) {
		return this.tierItems(tierId).evaluateAll((items) =>
			items.map((item) => (item as HTMLElement).dataset.itemId),
		);
	}

	/** Ids of the tier rows, top to bottom. */
	async tierIds() {
		return this.page
			.locator("[data-tier-id]")
			.evaluateAll((rows) =>
				rows.map((row) => (row as HTMLElement).dataset.tierId),
			);
	}

	async openTab(type: ItemType) {
		const tab = this.page.getByRole("tab", { name: TAB_NAMES[type] });
		await tab.click();
		await expect(tab).toHaveAttribute("aria-selected", "true");
	}

	async setPlacementMode(mode: "drag" | "click") {
		await this.page
			.getByText(mode === "drag" ? "Drag & drop" : "Click to place")
			.click();
	}

	async toggle(name: Toggle) {
		await this.page.getByText(TOGGLE_NAMES[name]).click();
	}

	/** Toggles a mode of the Stage + Modes pool, its switch labelled by the mode's image (e.g. "Turf War"). */
	async toggleMode(modeName: string) {
		await this.page
			.getByRole("tabpanel")
			.locator("label")
			.filter({ has: this.page.getByRole("switch", { name: modeName }) })
			.click();
	}

	/** Drags an item of the pool into the tier. */
	async dragItemToTier(itemId: string, tierId: string) {
		await dragAndDrop(this.page, {
			from: this.poolItem(itemId),
			to: this.tier(tierId),
		});
	}

	/** Drags an item placed in a tier onto another item of the same tier, taking its place. */
	async dragItemOnto(
		itemId: string,
		{ tierId, onto }: { tierId: string; onto: string },
	) {
		await dragAndDrop(this.page, {
			from: this.tier(tierId).locator(`[data-item-id="${itemId}"]`),
			to: this.tier(tierId).locator(`[data-item-id="${onto}"]`),
		});
	}

	/** Drags an item placed in a tier back to the pool. */
	async dragItemToPool(itemId: string) {
		await dragAndDrop(this.page, {
			from: this.page.locator(`[data-tier-id] [data-item-id="${itemId}"]`),
			to: this.page.getByRole("tabpanel"),
		});
	}

	async dragTier({ from, to }: { from: number; to: number }) {
		const handles = this.locators.tierDragHandles;

		await dragAndDrop(this.page, {
			from: handles.nth(from),
			to: handles.nth(to),
		});
	}

	/** In click to place mode, clicks an item of the pool to add it to the selected tier. */
	async clickItem(itemId: string) {
		await this.poolItem(itemId).click();
	}

	/** In click to place mode, selects the tier the clicked items go to. */
	async selectTier(tierId: string) {
		await this.tier(tierId).getByText("Click items to add here").click();
	}

	async addTier() {
		await this.locators.addTierButton.click();
	}

	/** Opens the editor of the tier with the given name by clicking its label. */
	async editTier(name: string) {
		await this.tierLabel(name).click();
		await expect(this.locators.tierEditor).toBeVisible();
	}

	/** In the open tier editor, types a new name for the tier. */
	async renameTier(name: string) {
		await this.locators.tierEditor.locator('input[type="text"]').fill(name);
	}

	/** In the open tier editor, picks one of the preset colors. */
	async pickTierColor(hex: string) {
		await this.locators.tierEditor.getByRole("button", { name: hex }).click();
	}

	/** In the open tier editor, deletes the tier. */
	async deleteTier() {
		await this.locators.tierEditor
			.getByRole("button", { name: "Delete" })
			.click();
	}

	/** Resets the tier list, confirming it in the popover. */
	async reset() {
		await this.page.getByRole("button", { name: "Reset" }).click();
		await this.page
			.getByRole("dialog")
			.getByRole("button", { name: "Reset" })
			.click();
	}

	async openExportDialog() {
		await this.page.getByRole("button", { name: "Export image" }).click();
		await expect(this.locators.exportDialog).toBeVisible();
	}

	/** In the open export dialog, types the title shown on the image. */
	async setExportTitle(title: string) {
		await this.locators.exportDialog
			.getByRole("textbox", { name: "Title" })
			.fill(title);
	}

	exportDialogText(content: string) {
		return this.locators.exportDialog.getByText(content, { exact: true });
	}

	private tier(tierId: string) {
		return this.page.locator(`[data-tier-id="${tierId}"]`);
	}
}
