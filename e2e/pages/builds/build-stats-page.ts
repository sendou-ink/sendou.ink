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

	buildsCount(count: number) {
		return this.page.getByText(`Based on ${count} builds`, { exact: true });
	}

	apAverage(ap: number) {
		return this.page.getByText(`${ap} AP`, { exact: true });
	}

	mainOnlyAbilityPercentages({
		abilityName,
		weaponPercentage,
		allPercentage,
	}: {
		abilityName: string;
		weaponPercentage: number;
		allPercentage: number;
	}) {
		return this.page.getByRole("img", {
			name: `${abilityName}: ${weaponPercentage}%, all weapons ${allPercentage}%`,
			exact: true,
		});
	}
}
