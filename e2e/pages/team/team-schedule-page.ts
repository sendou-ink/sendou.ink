import type { Page } from "@playwright/test";
import { teamPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class TeamSchedulePage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			grid: page.getByTestId("schedule-grid"),
			summary: page.getByTestId("schedule-summary"),
			hiddenMessage: page.getByTestId("schedule-hidden"),
			windows: page.getByTestId("schedule-window"),
			notes: page.getByTestId("schedule-note"),
			teamEvents: page.getByTestId("schedule-team-event"),
			addEventButton: page.getByTestId("add-team-event-button"),
			// the chip radio input is visually hidden, so the label is what clicks
			nextWeekToggle: page.locator(
				'label[for="chip-radio-schedule-week-next"]',
			),
		};
	}

	async goto(customUrl: string) {
		await navigate({
			page: this.page,
			url: `${teamPage(customUrl)}/schedule`,
		});
	}

	cell(userId: number, dayIndex: number) {
		return this.page.getByTestId(`schedule-cell-${userId}-${dayIndex}`);
	}

	cellRange(userId: number, dayIndex: number) {
		return this.cell(userId, dayIndex).getByTestId("schedule-range");
	}

	cellBusy(userId: number, dayIndex: number) {
		return this.cell(userId, dayIndex).getByTestId("schedule-busy");
	}

	dayDot(dayIndex: number) {
		return this.page.getByTestId(`schedule-day-dot-${dayIndex}`);
	}
}
