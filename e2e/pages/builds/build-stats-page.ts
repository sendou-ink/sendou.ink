import type { Page } from "@playwright/test";
import { weaponBuildStatsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class BuildStatsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(weaponSlug: string) {
		await navigate({ page: this.page, url: weaponBuildStatsPage(weaponSlug) });
	}

	buildsCountTitle(count: number, weaponName: string) {
		return this.page.getByText(`Stats from ${count} ${weaponName} builds`);
	}

	apAverage(ap: number) {
		return this.page.getByText(`${ap} AP`, { exact: true });
	}

	abilityPercentage(percentage: number) {
		return this.page.getByText(`${percentage}%`, { exact: true });
	}
}
