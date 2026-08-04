import type { Page } from "@playwright/test";
import { tournamentAdminPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";

const DRAG_TARGET_Y = 500;

export class TournamentSeedsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			setAbDivisionsButton: page.getByTestId("set-ab-divisions"),
			abDivisionRadioGroups: page.getByTestId("ab-division-radio-group"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: `${tournamentAdminPage(tournamentId)}/seeds`,
		});
	}

	teamHandle(tournamentTeamId: number) {
		return this.page.getByTestId(`seed-team-${tournamentTeamId}-handle`);
	}

	/** Drags a team down the seeding list, past the teams seeded below it. */
	async dragTeamDown(tournamentTeamId: number) {
		await this.teamHandle(tournamentTeamId).hover();
		await this.page.mouse.down();
		// i think the drag & drop library might actually be a bit buggy
		// so we have to do it in steps like this to allow for testing
		await this.page.mouse.move(0, DRAG_TARGET_Y, { steps: 10 });
		await this.page.mouse.up();
	}

	save() {
		return submit(this.page);
	}

	async openAbDivisionsDialog() {
		await this.locators.setAbDivisionsButton.click();
	}

	async openStartingBracketsDialog() {
		await this.page.getByTestId("set-starting-brackets").click();
	}

	async setStartingBracket(nth: number, bracketName: string) {
		await this.page
			.getByTestId("starting-bracket-select")
			.nth(nth)
			.selectOption(bracketName);
	}

	saveStartingBrackets() {
		return submit(this.page, "set-starting-brackets-submit-button");
	}

	async assignAbDivision(nth: number, division: "A" | "B") {
		await this.locators.abDivisionRadioGroups
			.nth(nth)
			.getByText(division, { exact: true })
			.click();
	}

	saveAbDivisions() {
		return submit(this.page, "set-ab-divisions-submit-button");
	}
}
