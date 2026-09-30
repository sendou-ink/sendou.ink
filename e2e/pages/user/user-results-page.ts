import type { Page } from "@playwright/test";
import { userResultsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { UserResultsHighlightsPage } from "./user-results-highlights-page";

/** `/u/:identifier/results` */
export class UserResultsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			tournamentNameCells: page.getByTestId("tournament-name-cell"),
			matesButtons: page.getByTestId("mates-button"),
			chooseHighlightsButton: page.getByRole("link", {
				name: "Choose highlights",
			}),
			highlightsFilter: page.getByTestId("highlights-filter"),
			highlightsOnlySwitch: page.getByRole("switch", {
				name: "Only highlighted results",
			}),
		};
	}

	/** Flips the highlights only filter, which a logged out visitor may use too. */
	async toggleHighlightsOnly() {
		await this.locators.highlightsFilter.click();
		// the switch indicator covers its input, like everywhere else this one is clicked
		await this.locators.highlightsOnlySwitch.click({ force: true });
		await this.page.keyboard.press("Escape");
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userResultsPage({ discordId }) });
	}

	tournamentName(name: string) {
		return this.locators.tournamentNameCells.getByText(name);
	}

	/** A calendar event result's link to the event. */
	eventName(name: string) {
		return this.page.getByRole("link", { name });
	}

	async openChooseHighlights() {
		await this.locators.chooseHighlightsButton.click();
		return new UserResultsHighlightsPage(this.page);
	}

	async openMates(nth: number) {
		await this.locators.matesButtons.nth(nth).click();
	}

	/** The teammates listed for the `nth` expanded result row. */
	matesListItems(nth: number) {
		return this.page.locator(`[data-testid="mates-cell-placement-${nth}"] li`);
	}
}
