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

	/** Drags across a day track, `from` and `to` being fractions of its width (past 1 runs beyond the shown hours). */
	async paintAvailability(dayIndex: number, from: number, to: number) {
		const track = this.page.getByTestId(`availability-track-${dayIndex}`);
		const box = await track.boundingBox();
		if (!box) {
			throw new Error("Missing bounding box for the day track");
		}

		const y = box.y + box.height / 2;
		await this.page.mouse.move(box.x + box.width * from, y);
		await this.page.mouse.down();
		await this.page.mouse.move(box.x + box.width * to, y, { steps: 10 });
		await this.page.mouse.up();
	}

	/** Drags an availability bar sideways by `deltaX` pixels, moving the whole range. */
	async dragAvailabilityBar(bar: Locator, deltaX: number) {
		const box = await bar.boundingBox();
		if (!box) {
			throw new Error("Missing bounding box for the availability bar");
		}

		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;
		await this.page.mouse.move(x, y);
		await this.page.mouse.down();
		await this.page.mouse.move(x + deltaX, y, { steps: 10 });
		await this.page.mouse.up();
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
