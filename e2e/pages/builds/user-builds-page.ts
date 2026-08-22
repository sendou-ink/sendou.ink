import type { Page } from "@playwright/test";
import {
	type BuildSort,
	DEFAULT_BUILD_SORT,
} from "~/features/user-page/user-page-constants";
import invariant from "~/utils/invariant";
import { userBuildsPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";
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
			deleteBuildButtons: page.getByTestId("delete-build"),
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

	/** Replaces the default sorts with the single given sort via the sorting dialog. */
	async changeSortingTo(sort: BuildSort) {
		await this.locators.changeSortingButton.click();

		const dialog = this.page.getByRole("dialog");
		for (let i = 0; i < DEFAULT_BUILD_SORT.length; i++) {
			await dialog.getByTestId("delete-sorting-button").click();
		}
		await dialog.getByRole("combobox").selectOption(sort);

		await submit(this.page);
	}

	async deleteBuild(nth: number) {
		await this.locators.deleteBuildButtons.nth(nth).click();
		await modalClickConfirmButton(this.page);
	}
}
