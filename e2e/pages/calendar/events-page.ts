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
			title: page.getByRole("heading", { name: "My Events" }),
			viewTabs: this.main.getByRole("navigation"),
			emptyCategoryText: page.getByText("No events in this category"),
		};
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
