import type { Page } from "@playwright/test";
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

export class TierListMakerPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			emptyTiersDragMode: page.getByText("Drop items here"),
			emptyTiersClickMode: page.getByText("Click items to add here"),
			tierDragHandles: page.getByRole("button", { name: "Reorder tier" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: TIER_LIST_MAKER_URL });
	}

	/** The tier list state lives in the url, so a reload restores it. */
	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	poolItems(type: ItemType) {
		return this.page
			.getByRole("tabpanel")
			.locator(`[data-item-id^="${type}:"]`);
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

	async dragFirstItemToLastEmptyTier(type: ItemType) {
		const emptyTiers = this.locators.emptyTiersDragMode;
		const emptyCountBefore = await emptyTiers.count();

		await dragAndDrop(this.page, {
			from: this.poolItems(type).first(),
			to: emptyTiers.last(),
		});

		await expect(emptyTiers).toHaveCount(emptyCountBefore - 1);
	}

	/** Ids of the tier rows, top to bottom. */
	async tierIds() {
		return this.page
			.locator("[data-tier-id]")
			.evaluateAll((rows) =>
				rows.map((row) => (row as HTMLElement).dataset.tierId),
			);
	}

	async dragTier({ from, to }: { from: number; to: number }) {
		const handles = this.locators.tierDragHandles;

		await dragAndDrop(this.page, {
			from: handles.nth(from),
			to: handles.nth(to),
		});
	}

	async clickFirstItem(type: ItemType) {
		await this.poolItems(type).first().click();
	}

	async selectFirstEmptyTier() {
		await this.locators.emptyTiersClickMode.first().click();
	}
}
