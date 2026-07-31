import type { Page } from "@playwright/test";
import {
	cancelScrimFormSchema,
	submitMapListFormSchema,
} from "~/features/scrims/scrims-schemas";
import { scrimPage } from "~/utils/urls";
import {
	expect,
	navigate,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

type Side = "ALPHA" | "BRAVO";
type Tab = "rosters" | "action" | "result" | "stats";

const TAB_NAMES: Record<Tab, string> = {
	rosters: "Rosters",
	action: "Action",
	result: "Result",
	stats: "Stats",
};

const WINNER_RADIO_TEST_IDS: Record<Side, string> = {
	ALPHA: "winner-radio-1",
	BRAVO: "winner-radio-2",
};

/** A booked scrim: its rosters, the map by map reporting and the resulting stats. */
export class ScrimPage {
	private readonly page: Page;
	readonly locators;
	readonly mapListForm;
	readonly cancelForm;

	constructor(page: Page) {
		this.page = page;
		this.mapListForm = createFormHelpers(page, submitMapListFormSchema, {
			submitTestId: "submit-map-list-button",
		});
		this.cancelForm = createFormHelpers(page, cancelScrimFormSchema, {
			submitTestId: "cancel-scrim-submit",
		});
		this.locators = {
			subtitle: page.getByText("Scheduled scrim"),
			mapListForm: page.getByTestId("scrim-map-list-form"),
			manageMapListsButton: page.getByRole("button", {
				name: /Manage map lists/i,
			}),
			reportScoreButton: page.getByTestId("report-score-button"),
			undoMapButton: page.getByTestId("undo-map-button"),
			replayMapButton: page.getByTestId("replay-map-button"),
			statsRoot: page.getByTestId("scrim-stats-root"),
			selectedWinner: page.locator(
				'[data-testid^="winner-radio-"][data-selected="true"]',
			),
		};
	}

	async goto(scrimId: number) {
		await navigate({ page: this.page, url: scrimPage(scrimId) });
	}

	async openTab(tab: Tab) {
		await this.page.getByRole("tab", { name: TAB_NAMES[tab] }).click();
	}

	mapListRow(side: Side) {
		return this.page.getByTestId(`map-list-row-${side}`);
	}

	/** Submits the map list with the source the form defaults to. */
	async submitMapList() {
		await waitForPOSTResponse(this.page, () => this.mapListForm.submit());
	}

	async submitPoolMapList(serializedPool: string) {
		await this.page.getByLabel("Pool URL").click();
		await this.mapListForm.fill("serializedPool", serializedPool);
		await this.submitMapList();
	}

	/** The map lists of both sides are behind a collapsed section while a map is being played. */
	async openMapListManager() {
		await this.locators.manageMapListsButton.click();
	}

	async removeOwnMapList(side: Side) {
		await this.mapListRow(side)
			.getByLabel(/Remove list/i)
			.click();
		await waitForPOSTResponse(this.page, () =>
			submit(this.page, "confirm-button"),
		);
	}

	async reportMapWinner(winner: Side) {
		// the report of the previous map leaves the radios selected until the
		// loader revalidation swaps the next map in
		await expect(this.locators.selectedWinner).toHaveCount(0);

		await this.page.getByTestId(WINNER_RADIO_TEST_IDS[winner]).click();
		await submit(this.page, "report-score-button");
	}

	async undoMap() {
		await submit(this.page, "undo-map-button");
	}

	/** Replaces the map waiting to be played with a copy of the last reported one. */
	async replayMap() {
		await submit(this.page, "replay-map-button");
	}

	async cancel(reason: string) {
		await this.page.getByRole("button", { name: "Cancel" }).click();
		await this.cancelForm.fill("reason", reason);
		await submit(this.page, "cancel-scrim-submit");
	}

	/** Groups the stats by mode, counting maps outside the viewer's own pool too. */
	async showModeStatsOfAllMaps() {
		await this.locators.statsRoot.getByText("Mode", { exact: true }).click();
		await this.page.getByRole("switch").click({ force: true });
	}

	/** How many maps the stats table accounts for, from the viewer's point of view. */
	async reportedMapCount() {
		const wins = await this.locators.statsRoot
			.locator("tbody tr td:nth-child(2)")
			.allInnerTexts();
		const losses = await this.locators.statsRoot
			.locator("tbody tr td:nth-child(3)")
			.allInnerTexts();

		return [...wins, ...losses].reduce(
			(total, cell) => total + Number(cell),
			0,
		);
	}
}
