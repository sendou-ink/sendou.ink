import type { Locator, Page } from "@playwright/test";
import { EVENTS_PAGE } from "~/utils/urls";
import {
	expect,
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";
import { TeamSchedulePage } from "../team/team-schedule-page";

const VIEW_LABELS = {
	registered: "Registered",
	hosting: "Hosting",
	scrims: "Scrims",
	saved: "Saved",
	organization: "Organization",
};

/** `/events`: the user's events by category and "My availability", the editor of their schedule. */
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
			savedToast: page.getByText("Availability saved"),
			copyLastWeekButton: page.getByTestId("copy-last-week-button"),
			dayEditorPopover: page.getByRole("dialog"),
			teamScheduleLink: page.getByTestId("team-schedule-link"),
			visibilityButton: page.getByTestId("schedule-visibility-button"),
			notSharedWith: page.getByTestId("schedule-not-shared-with"),
			// the chip radio input is visually hidden, so the label is what clicks
			nextWeekToggle: page.locator(
				'label[for="chip-radio-my-schedule-week-next"]',
			),
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

	/** Opens the day's editor popover, fills in its one range and note, and closes it to commit them. */
	async fillInDay(
		dayIndex: number,
		{ start, end, note }: { start: string; end: string; note?: string },
	) {
		await this.dayEditButton(dayIndex).click();
		const popover = this.locators.dayEditorPopover;
		await popover.getByLabel("Start").fill(start);
		await popover.getByLabel("End").fill(end);
		if (note) await popover.getByLabel("Note").fill(note);
		await this.page.keyboard.press("Escape");
	}

	/** The note field of the open day editor popover. */
	dayNote() {
		return this.locators.dayEditorPopover.getByLabel("Note");
	}

	/** Deletes the only range of the day from its editor popover, which closes as the deletion commits. */
	async deleteOnlyRange(dayIndex: number) {
		await this.dayEditButton(dayIndex).click();
		await this.locators.dayEditorPopover
			.getByRole("button", { name: "Delete" })
			.click();
	}

	/** Saves the shown week, waiting for the confirmation toast. */
	async saveWeek() {
		await this.locators.saveWeekButton.click();
		await expect(this.locators.savedToast).toBeAttached();
	}

	/** Saves the shown week with nothing filled in, confirming it marks the user unavailable all week. */
	async saveEmptyWeek() {
		await this.locators.saveWeekButton.click();
		await modalClickConfirmButton(this.page);
		await expect(this.locators.savedToast).toBeAttached();
	}

	/** Fills the shown week with the ranges of the week before it, the current week for the next one. */
	async copyLastWeek() {
		await this.locators.copyLastWeekButton.click();
	}

	async openNextWeek() {
		await this.locators.nextWeekToggle.click();
	}

	/** Follows the "Team schedule" link, keeping the week shown. */
	async openTeamSchedule() {
		await this.locators.teamScheduleLink.click();
		return new TeamSchedulePage(this.page);
	}

	/**
	 * Opens the schedule visibility dialog, toggles the named audiences and saves. The options are
	 * team names and "All friends", data rather than locale keys, so they are matched by their name.
	 */
	async setScheduleVisibility({
		check = [],
		uncheck = [],
	}: {
		check?: Array<string>;
		uncheck?: Array<string>;
	}) {
		await this.locators.visibilityButton.click();
		const dialog = this.page.getByRole("dialog");

		for (const name of uncheck) {
			await dialog.getByRole("checkbox", { name, exact: true }).uncheck();
		}
		for (const name of check) {
			await dialog.getByRole("checkbox", { name, exact: true }).check();
		}

		await submit(this.page);
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
