import type { Page } from "@playwright/test";
import {
	calendarIcalFeed,
	calendarPage,
} from "~/features/calendar/calendar-urls";
import type { DayMonthYear } from "~/utils/schema";
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
			addFilterButton: page.getByTestId("add-filter-button"),
			saveFiltersAsDefaultButton: page.getByTestId(
				"save-filters-as-default-button",
			),
			navigateButtons: page.getByTestId("calendar-navigate-button"),
		};
	}

	/** Given a date, opens the calendar at that week instead of the current one. */
	async goto(dayMonthYear?: DayMonthYear) {
		await navigate({ page: this.page, url: calendarPage({ dayMonthYear }) });
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
		await this.openEventTypeFilter();
		await this.page
			.getByText(
				name === "isSendou"
					? "Only events hosted on sendou.ink"
					: "Only ranked events",
			)
			.click();
		await this.page.keyboard.press("Escape");
	}

	/** Resets the "Event type" filter pill's filters, hiding the pill. */
	async removeEventTypeFilter() {
		await this.page.keyboard.press("Escape");
		await this.page.getByTestId("event-type-filter-remove").click();
	}

	/** The pill is only rendered while its filters differ from the defaults. */
	private async openEventTypeFilter() {
		if (await this.locators.eventTypeFilterPill.isVisible()) {
			await this.locators.eventTypeFilterPill.click();
			return;
		}

		await this.locators.addFilterButton.click();
		await this.page.getByTestId("menu-item-event-type-filter").click();
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

	/** Fetches the iCal feed directly, the way a subscribed calendar app does. */
	async fetchICalFeed() {
		const url = new URL(calendarIcalFeed());
		const response = await this.page.request.get(url.pathname + url.search);
		return { status: response.status(), body: await response.text() };
	}

	async navigatePrevious() {
		await this.locators.navigateButtons.first().click();
	}

	async navigateNext() {
		await this.locators.navigateButtons.nth(1).click();
	}
}
