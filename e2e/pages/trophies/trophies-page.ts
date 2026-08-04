import type { Page } from "@playwright/test";
import { TROPHIES_PAGE, trophyPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/trophies` */
export class TrophiesPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			searchInput: page.getByRole("textbox"),
			trophyLinks: page.locator("a[href^='/trophies/']"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: TROPHIES_PAGE });
	}

	/** The list is filtered by name, as it is the only way to find one trophy of many. */
	search(query: string) {
		return this.locators.searchInput.fill(query);
	}

	tile(trophyId: number) {
		return this.page.locator(`a[href='${trophyPage(trophyId)}']`);
	}

	tentativeTier(trophyId: number) {
		return this.tile(trophyId).getByTestId("tentative-tier");
	}

	/** Marks a trophy whose next tournament is close enough to be highlighted. */
	upcomingPill(trophyId: number) {
		return this.tile(trophyId).getByTestId("trophy-corner-pill");
	}

	async openFirst() {
		await this.locators.trophyLinks.first().click();
		return new TrophyDetailsPage(this.page);
	}
}

/** `/trophies/:id` */
class TrophyDetailsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			ownersHeading: page.getByText("Owners", { exact: true }),
			ownerLinks: page.locator("main").locator("a[href^='/u/']"),
		};
	}

	tournamentRow(tournamentId: number) {
		return this.page.locator("main").locator(`a[href='/to/${tournamentId}']`);
	}
}
