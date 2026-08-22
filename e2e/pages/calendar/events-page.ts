import type { Locator, Page } from "@playwright/test";
import { EVENTS_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

const VIEW_LABELS = {
	registered: "Registered",
	hosting: "Hosting",
	scrims: "Scrims",
	saved: "Saved",
	organization: "Organization",
};

/** `/events` */
export class EventsPage {
	private readonly page: Page;
	private readonly main: Locator;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.main = page.locator("main");
		this.locators = {
			title: page.getByRole("heading", { name: "My events" }),
			viewTabs: this.main.getByRole("navigation"),
			emptyCategoryText: page.getByText("No events in this category"),
			mySchedule: page.getByTestId("my-schedule"),
			availabilityBars: page.getByTestId("availability-bar"),
			commitments: page.getByTestId("availability-commitment"),
			saveWeekButton: page.getByTestId("save-week-button"),
			copyLastWeekButton: page.getByTestId("copy-last-week-button"),
			dayEditorPopover: page.getByRole("dialog"),
		};
	}

	/** The "• not filled" marker on a week toggle chip. */
	weekNotFilledMarker(week: "current" | "next") {
		return this.page.getByTestId(`week-not-filled-${week}`);
	}

	/** The pencil button opening the day editor popover of a day track. */
	dayEditButton(dayIndex: number) {
		return this.page.getByTestId(`availability-day-edit-${dayIndex}`);
	}

	async goto() {
		await navigate({ page: this.page, url: EVENTS_PAGE });
	}

	/** The tabs carry the category's event count, so they are matched by their start. */
	async openView(view: keyof typeof VIEW_LABELS) {
		await this.locators.viewTabs
			.getByRole("link", { name: new RegExp(`^${VIEW_LABELS[view]}`) })
			.click();
	}

	eventLink(name: string) {
		return this.main.getByRole("link", { name });
	}
}
