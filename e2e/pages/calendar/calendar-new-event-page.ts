import type { Page } from "@playwright/test";
import { calendarNewBaseSchema } from "~/features/calendar/calendar-new-schemas";
import { CALENDAR_NEW_PAGE, TOURNAMENT_NEW_PAGE } from "~/utils/urls";
import {
	datetimeLocalValue,
	dragAndDrop,
	navigate,
	submit,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

const ALL_MODE_NAMES = [
	"Turf War",
	"Splat Zones",
	"Tower Control",
	"Rainmaker",
	"Clam Blitz",
];

/** `/calendar/new`, also used for adding tournaments (a form of steps) and editing existing events. */
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
			addBracketButton: page.getByTestId("builder-add-bracket-button"),
			bracketCards: page.getByTestId("builder-bracket-card"),
			connectionPills: page.getByTestId("builder-connection-pill"),
			// the builder's side panel edits one bracket or connection at a time
			bracketNameInput: page.getByLabel(/^Bracket name *\*?$/),
			bracketFormatSelect: page.getByLabel("Format", { exact: true }),
			placementsInput: page.getByLabel("Placements"),
			deleteBracketButton: page.getByTestId("builder-delete-bracket-button"),
			startingBracketsColumn: page.getByText("Starting brackets", {
				exact: true,
			}),
			lastStepButton: page.getByTestId("form-step-button-prizes"),
			mapPoolTemplateSelect: page.getByLabel("Template"),
			groupCountSelect: page.getByLabel(/^Group count/),
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
		await this.page
			.getByLabel(/^Date *\*?$/)
			.first()
			.fill(datetimeLocalValue(date));
	}

	// a mode's checkbox and its "Maps per mode" input share the mode's name as
	// their label, so they are told apart by role
	teamPickModeCheckbox(modeName: string) {
		return this.page.getByRole("checkbox", { name: modeName });
	}

	teamPickCountInput(modeName: string) {
		return this.page.getByRole("spinbutton", { name: modeName });
	}

	/** Text of the alert below the custom team pick pool, telling whether it has enough stages. */
	teamPickPoolStatus(text: string) {
		return this.page.getByText(text);
	}

	/** Checks exactly the given modes for teams to pick maps in. */
	async setTeamPickModes(modeNames: string[]) {
		for (const modeName of ALL_MODE_NAMES) {
			const checkbox = this.teamPickModeCheckbox(modeName);
			const shouldBeChecked = modeNames.includes(modeName);

			if ((await checkbox.isChecked()) !== shouldBeChecked) {
				await checkbox.click();
			}
		}
	}

	// the map pool grid exposes each map as a mode button inside a group labelled
	// by its stage name, both for the TO pool and the custom team pick pool
	async pickMapPool(maps: Array<{ stage: string; mode: string }>) {
		for (const { stage, mode } of maps) {
			await this.page
				.getByRole("group", { name: stage })
				.getByRole("button", { name: mode })
				.click();
		}
	}

	/** Opens a step of the tournament form. Moving forward validates the steps passed. */
	async goToStep(step: "basics" | "teams" | "maps" | "format" | "prizes") {
		await this.page.getByTestId(`form-step-button-${step}`).click();
	}

	/** Selects a bracket of the format builder for editing in its side panel. */
	async selectBracket(nth: number) {
		await this.goToStep("format");
		await this.locators.bracketCards
			.nth(nth)
			.getByRole("button")
			.first()
			.click();
	}

	async addBracket({ name, format }: { name: string; format: string }) {
		await this.goToStep("format");
		await this.locators.addBracketButton.click();
		await this.locators.bracketNameInput.fill(name);
		await this.locators.bracketFormatSelect.selectOption(format);
	}

	/** Sends teams from one bracket to another, optionally typing out which placements. */
	async connect(fromNth: number, toNth: number, placements?: string) {
		await this.goToStep("format");
		await this.locators.bracketCards
			.nth(fromNth)
			.getByRole("button", { name: /^Send teams from/ })
			.click();
		await this.locators.bracketCards
			.nth(toNth)
			.getByRole("button")
			.first()
			.click();

		if (placements !== undefined) {
			await this.locators.placementsInput.fill(placements);
		}
	}

	async deleteLastBracket() {
		await this.selectBracket((await this.locators.bracketCards.count()) - 1);
		await this.locators.deleteBracketButton.click();
	}

	/** Types out the placements of the last connection of the format builder. */
	async fillLastPlacements(placements: string) {
		await this.goToStep("format");
		await this.locators.connectionPills.last().click();
		await this.locators.placementsInput.fill(placements);
	}

	async setBracketFormat(nth: number, formatLabel: string) {
		await this.selectBracket(nth);
		await this.locators.bracketFormatSelect.selectOption(formatLabel);
	}

	/** Moves every bracket to the starting brackets column, removing their connections. */
	async makeAllBracketsStartingBrackets() {
		await this.goToStep("format");
		const count = await this.locators.bracketCards.count();
		for (let nth = 1; nth < count; nth++) {
			await dragAndDrop(this.page, {
				from: this.locators.bracketCards.nth(nth),
				to: this.locators.startingBracketsColumn,
			});
		}
	}

	/** Checkbox of a named round in the selected bracket's "Rounds played" list, e.g. "LB_SEMIS". */
	roundPlayedCheckbox(round: string) {
		return this.page.getByTestId(`round-played-${round}`);
	}

	/** Hint under a round left unplayed because a round feeding it is. */
	roundNotPlayedHint(prerequisiteName: string) {
		return this.page
			.getByText(`Not played without ${prerequisiteName}`)
			.first();
	}

	async clearMapPool() {
		await this.locators.clearMapPoolButton.click();
	}

	async selectMapPoolTemplate(value: string) {
		await this.locators.mapPoolTemplateSelect.selectOption(value);
	}

	/** Submits the form, from the last step when it is a tournament form of steps. */
	async save() {
		if (await this.locators.lastStepButton.isVisible()) {
			await this.locators.lastStepButton.click();
		}

		return submit(this.page);
	}

	/** Adds a bracket taking teams from the first bracket with the given placements. */
	async addFollowUpBracket({
		name,
		format,
		placements,
	}: {
		name: string;
		format: string;
		placements: string;
	}) {
		await this.addBracket({ name, format });
		const lastNth = (await this.locators.bracketCards.count()) - 1;
		await this.connect(0, lastNth, placements);
	}

	async renameBracket(nth: number, name: string) {
		await this.selectBracket(nth);
		await this.locators.bracketNameInput.fill(name);
	}
}
