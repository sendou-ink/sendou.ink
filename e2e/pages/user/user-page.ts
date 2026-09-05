import type { Page } from "@playwright/test";
import { userPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { TeamPage } from "../team/team-page";
import { TopSearchPlayerPage } from "../top-search/top-search-player-page";
import { UserEditProfilePage } from "./user-edit-profile-page";
import { UserEditWidgetsPage } from "./user-edit-widgets-page";
import { UserResultsPage } from "./user-results-page";
import { UserVodsPage } from "./user-vods-page";

export class UserPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			badgeDisplay: page.getByTestId("badge-display"),
			badgePaginationButtons: page.getByTestId("badge-pagination-button"),
			editProfileButton: page.getByRole("link", { name: "Edit Profile" }),
			editWidgetsButton: page.getByRole("link", { name: "Edit Widgets" }),
			// the icon nav has a desktop and a mobile copy, only one of them shown
			seasonsTab: page.locator('[data-testid="user-seasons-tab"]:visible'),
			vodsTab: page.locator('[data-testid="user-vods-tab"]:visible'),
			resultsTab: page.locator('[data-testid="user-results-tab"]:visible'),
			seasonsTournamentResult: page.getByTestId("seasons-tournament-result"),
		};
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userPage({ discordId }) });
	}

	badgeImage(displayName: string) {
		return this.page.getByAltText(displayName, { exact: true });
	}

	flag(countryCode: string) {
		return this.page.getByTestId(`flag-${countryCode}`);
	}

	/** A weapon of the profile's weapon pool, `position` counting from one. */
	weaponPoolImage(weaponSplId: number, position: number) {
		return this.page.getByTestId(`${weaponSplId}-${position}`);
	}

	text(content: string) {
		return this.page.getByText(content);
	}

	exactText(content: string) {
		return this.page.getByText(content, { exact: true });
	}

	/** The title of a profile widget. */
	widgetHeading(name: string) {
		return this.page.getByRole("heading", { name, exact: true });
	}

	/** A profile widget by its id. */
	widget(widgetId: string) {
		return this.page.getByTestId(`widget-${widgetId}`);
	}

	/** The teams the user is a member of, their main team first. */
	teamLinks() {
		return this.widget("teams").getByRole("link");
	}

	usernameHeading(username: string) {
		return this.page.getByRole("heading", { name: username });
	}

	async openEditProfile() {
		await this.locators.editProfileButton.click();
		return new UserEditProfilePage(this.page);
	}

	async openMainTeam() {
		await this.teamLinks().first().click();
		return new TeamPage(this.page);
	}

	/** The X Rank summary, shown only for a user with a linked player. */
	async openPlacements() {
		await this.widget("x-rank-peaks").getByRole("link").click();
		return new TopSearchPlayerPage(this.page);
	}

	async openSeasons() {
		await this.locators.seasonsTab.click();
	}

	async openResults() {
		await this.locators.resultsTab.click();
		return new UserResultsPage(this.page);
	}

	async openVods() {
		await this.locators.vodsTab.click();
		return new UserVodsPage(this.page);
	}

	async openEditWidgets() {
		await this.locators.editWidgetsButton.click();
		return new UserEditWidgetsPage(this.page);
	}
}
