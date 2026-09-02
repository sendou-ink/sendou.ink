import type { Page } from "@playwright/test";
import { calendarNewBaseSchema } from "~/features/calendar/calendar-new-schemas";
import { CALENDAR_NEW_PAGE, TOURNAMENT_NEW_PAGE } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/calendar/new`, also used for adding tournaments and editing existing events. */
export class CalendarNewEventPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, calendarNewBaseSchema);
		this.locators = {
			nameInput: page.getByLabel(/^Name *\*?$/),
			newTournamentHeading: page.getByText("New tournament"),
			noTournamentPermissionsAlert: page.getByText(
				"No permissions to add tournaments",
			),
			addBracketButton: page.getByTestId("brackets-add-item-button"),
			bracketNameInputs: page.getByLabel(/^Bracket name *\*?$/),
			bracketFormatSelects: page.getByLabel("Format"),
			placementsInputs: page.getByLabel("Placements"),
			deleteBracketButtons: page.getByTestId("brackets-remove-item-button"),
			signUpSourceRadios: page.getByRole("radio", { name: "Sign-up" }),
			// the sources array is nested inside a progression item, so its add button
			// test id is prefixed by the item's path e.g. "progression[1].sources"
			addSourceButtons: page.locator(
				'[data-testid$="sources-add-item-button"]',
			),
			mapPoolTemplateSelect: page.getByLabel("Template"),
			clearMapPoolButton: page.getByRole("button", { name: "Clear" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: CALENDAR_NEW_PAGE });
	}

	async gotoNewTournament() {
		await navigate({ page: this.page, url: TOURNAMENT_NEW_PAGE });
	}

	// the `date` inputs carry the array item's label ("Date"), not the array's, so the form helper can't drive them
	async setFirstDate(date: Date) {
		const fill = (segment: string, value: string) =>
			this.page
				.getByRole("spinbutton", { name: new RegExp(`^${segment}, Date`) })
				.first()
				.fill(value);

		const hours = date.getHours();
		await fill("year", String(date.getFullYear()));
		await fill("month", String(date.getMonth() + 1));
		await fill("day", String(date.getDate()));
		await fill("hour", String(hours % 12 || 12));
		await fill("minute", date.getMinutes().toString().padStart(2, "0"));
		await fill("AM/PM", hours >= 12 ? "PM" : "AM");
	}

	// the TO map pool grid exposes each map as a mode button inside a group labelled
	// by its stage name
	async pickMapPool(maps: Array<{ stage: string; mode: string }>) {
		for (const { stage, mode } of maps) {
			await this.page
				.getByRole("group", { name: stage })
				.getByRole("button", { name: mode })
				.click();
		}
	}

	async deleteLastBracket() {
		await this.locators.deleteBracketButtons.last().click();
	}

	async fillLastPlacements(placements: string) {
		await this.locators.placementsInputs.last().fill(placements);
	}

	async setBracketFormat(nth: number, formatLabel: string) {
		await this.locators.bracketFormatSelects.nth(nth).selectOption(formatLabel);
	}

	/** Selects the "Sign-up" source for every bracket, making them all starting brackets. */
	async makeAllBracketsStartingBrackets() {
		for (const radio of await this.locators.signUpSourceRadios.all()) {
			if (await radio.isEnabled()) {
				await radio.check();
			}
		}
	}

	async clearMapPool() {
		await this.locators.clearMapPoolButton.click();
	}

	async selectMapPoolTemplate(value: string) {
		await this.locators.mapPoolTemplateSelect.selectOption(value);
	}

	save() {
		return submit(this.page);
	}

	// a freshly added bracket is already a follow-up (sourcing from the first
	// bracket), so it only needs its name, format and source placements filled in
	async addFollowUpBracket({
		name,
		format,
		placements,
	}: {
		name: string;
		format: string;
		placements: string;
	}) {
		await this.locators.addBracketButton.click();

		await this.locators.bracketNameInputs.last().fill(name);
		await this.locators.bracketFormatSelects.last().selectOption(format);
		await this.locators.placementsInputs.last().fill(placements);
	}

	async renameBracket(nth: number, name: string) {
		await this.locators.bracketNameInputs.nth(nth).fill(name);
	}

	/** Adds another source bracket to the last bracket of the progression. The new
	 * row preselects the first bracket not sourced by it yet. */
	async addSourceToLastBracket(placements: string) {
		await this.locators.addSourceButtons.last().click();
		await this.locators.placementsInputs.last().fill(placements);
	}
}
