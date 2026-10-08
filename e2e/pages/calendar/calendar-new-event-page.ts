import type { Page } from "@playwright/test";
import { parse } from "date-fns";
import { calendarNewBaseSchema } from "~/features/calendar/calendar-new-schemas";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import { mapsPageWithMapPool } from "~/features/map-list-generator/map-list-generator-urls";
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
			bracketStartTimeInput: page.getByLabel(/^Start time *\*?$/),
			bracketStartBeforeTournamentError: page.getByText(
				"Can't start before the tournament starts",
			),
			bracketFormatSelect: page.getByLabel("Format", { exact: true }),
			placementCheckboxes: page.getByRole("checkbox", { name: /^#\d+/ }),
			// chip radios hide the input visually, so the label takes the click
			bestFinishersModeChip: page.getByText("Best finishers", { exact: true }),
			knockedOutModeChip: page.getByText("Knocked out early", { exact: true }),
			deleteBracketButton: page.getByTestId("builder-delete-bracket-button"),
			startingBracketsColumn: page.getByText("Starting brackets", {
				exact: true,
			}),
			lastStepButton: page.getByTestId("form-step-button-prizes"),
			discardChangesButton: page.getByTestId("discard-changes-button"),
			groupCountSelect: page.getByLabel(/^Group count/),
			clearMapPoolButton: page.getByRole("button", { name: "Clear" }),
			pasteMapPoolLinkButton: page.getByRole("button", {
				name: "Paste from a map pool link",
			}),
			mapPoolLinkInput: page.getByLabel("Map pool link"),
			copyTournamentSelect: page.getByLabel("Tournament to copy"),
			useTemplateButton: page.getByTestId("use-template-button"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: CALENDAR_NEW_PAGE });
	}

	async gotoNewTournament() {
		await navigate({ page: this.page, url: TOURNAMENT_NEW_PAGE });
	}

	/** Fills the form in with the settings of a previous tournament of the user. */
	async copyTournament(eventId: number) {
		await this.locators.copyTournamentSelect.selectOption(String(eventId));
		await this.locators.useTemplateButton.click();
		await this.page.waitForURL(/copyEventId=/);
	}

	/** Start time of the tournament as currently filled in. */
	async tournamentStartTime() {
		const value = await this.page
			.getByLabel(/^Date *\*?$/)
			.first()
			.inputValue();

		return parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
	}

	bracketCard(name: string) {
		return this.locators.bracketCards.filter({ hasText: name });
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

	// the map pool field has a tab per mode, each holding a checkbox per stage,
	// both for the TO pool and the custom team pick pool
	async pickMapPool(maps: Array<{ stage: string; mode: string }>) {
		for (const { stage, mode } of maps) {
			await this.page.getByRole("tab", { name: mode }).click();
			await this.page
				.getByRole("tabpanel")
				.getByRole("checkbox", { name: stage, exact: true })
				.click();
		}
	}

	/** Opens a step of the tournament form. Moving forward validates the steps passed. */
	async goToStep(step: "basics" | "teams" | "maps" | "format" | "prizes") {
		await this.stepButton(step).click();
	}

	/** The button of a step in the stepper, carrying `aria-current="step"` while it is open. */
	stepButton(step: "basics" | "teams" | "maps" | "format" | "prizes") {
		return this.page.getByTestId(`form-step-button-${step}`);
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

	/** Sends teams from one bracket to another, optionally picking which placements. */
	async connect(fromNth: number, toNth: number, placements?: number[]) {
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
			await this.pickPlacements(placements);
		}
	}

	/** Picks exactly these placements in the open connection panel, negative ones being knocked out rounds. */
	private async pickPlacements(placements: number[]) {
		if (placements.every((placement) => placement < 0)) {
			await this.locators.knockedOutModeChip.click();
			await this.page
				.getByRole("radio", {
					name:
						placements.length === 1
							? "Lost in round 1"
							: `Lost in rounds 1–${placements.length}`,
				})
				.check();
			return;
		}

		if ((await this.locators.bestFinishersModeChip.count()) > 0) {
			await this.locators.bestFinishersModeChip.click();
		}
		for (const checkbox of await this.locators.placementCheckboxes.all()) {
			if (await checkbox.isDisabled()) continue;
			const label = await checkbox.locator("xpath=..").innerText();
			const placement = Number(label.match(/#(\d+)/)?.[1]);
			await checkbox.setChecked(placements.includes(placement));
		}
	}

	async deleteLastBracket() {
		await this.selectBracket((await this.locators.bracketCards.count()) - 1);
		await this.locators.deleteBracketButton.click();
	}

	/** Picks the placements of the last connection of the format builder. */
	async pickLastPlacements(placements: number[]) {
		await this.goToStep("format");
		await this.locators.connectionPills.last().click();
		await this.pickPlacements(placements);
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
		await this.page.getByTestId("confirm-button").click();
	}

	/** Replaces the map pool by pasting a map pool link of it. */
	async pasteMapPool(mapPool: MapPool) {
		await this.locators.pasteMapPoolLinkButton.click();
		await this.locators.mapPoolLinkInput.fill(
			`https://sendou.ink${mapsPageWithMapPool(mapPool)}`,
		);
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
		placements: number[];
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
