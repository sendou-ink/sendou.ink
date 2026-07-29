import type { Page } from "@playwright/test";
import invariant from "~/utils/invariant";
import { userBuildsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { BuildCard } from "./build-card";
import { BuildFormPage } from "./build-form-page";

export class UserBuildsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			buildsTab: page.getByTestId("user-builds-tab"),
			changeSortingButton: page.getByTestId("change-sorting-button"),
			buildCards: page.getByTestId("build-card"),
			editBuildLinks: page.getByTestId("edit-build"),
		};
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userBuildsPage({ discordId }) });
	}

	buildCard(nth: number) {
		return new BuildCard(this.locators.buildCards.nth(nth));
	}

	async buildId(nth: number) {
		const href = await this.locators.editBuildLinks
			.nth(nth)
			.getAttribute("href");
		invariant(href, "edit-build link missing href");
		const match = href.match(/buildId=(\d+)/);
		invariant(match, `buildId not found in href: ${href}`);
		return Number(match[1]);
	}

	async editBuild(nth: number) {
		await this.locators.editBuildLinks.nth(nth).click();
		return new BuildFormPage(this.page);
	}
}
