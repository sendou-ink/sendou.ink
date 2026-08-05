import type { Page } from "@playwright/test";
import { calendarPage } from "~/utils/urls";
import {
	expectIsHydrated,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** `/calendar` */
export class CalendarPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			tournamentCards: page.getByTestId("tournament-card"),
			hiddenEventsButtons: page.getByTestId("hidden-events-button"),
			clockHeaderTimes: page.getByTestId("clock-header-time"),
			todayHeader: page.getByTestId("today-header"),
			eventTypeFilterPill: page.getByTestId("event-type-filter"),
			saveFiltersAsDefaultButton: page.getByTestId(
				"save-filters-as-default-button",
			),
			navigateButtons: page.getByTestId("calendar-navigate-button"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: calendarPage() });
	}

	tournamentCard(name: string) {
		return this.locators.tournamentCards.filter({ hasText: name });
	}

	tentativeTierPill(tournamentName: string) {
		return this.tournamentCard(tournamentName).getByTestId("tentative-tier");
	}

	confirmedTierPill(tournamentName: string) {
		return this.tournamentCard(tournamentName).getByTestId("confirmed-tier");
	}

	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	/** Toggles one of the switches inside the "Event type" filter pill's popover. */
	async toggleEventTypeFilter(name: "isSendou" | "isRanked") {
		await this.page.keyboard.press("Escape");
		await this.locators.eventTypeFilterPill.click();
		await this.page
			.getByText(
				name === "isSendou"
					? "Only events hosted on sendou.ink"
					: "Only ranked events",
			)
			.click();
		await this.page.keyboard.press("Escape");
	}

	/** Persists the current filters as the user's default. */
	async saveFiltersAsDefault() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.saveFiltersAsDefaultButton.click(),
		);
	}

	/** Shows or hides the events the current filters hide, of the first time slot. */
	async toggleHiddenEvents() {
		await this.locators.hiddenEventsButtons.first().click();
	}

	async navigatePrevious() {
		await this.locators.navigateButtons.first().click();
	}

	async navigateNext() {
		await this.locators.navigateButtons.nth(1).click();
	}
}
