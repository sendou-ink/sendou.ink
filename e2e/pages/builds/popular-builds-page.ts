import type { Page } from "@playwright/test";
import type { Ability } from "~/modules/in-game-lists/types";
import { weaponBuildPopularPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class PopularBuildsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(weaponSlug: string) {
		await navigate({
			page: this.page,
			url: weaponBuildPopularPage(weaponSlug),
		});
	}

	placement(nth: number) {
		return this.page.getByText(`#${nth}`, { exact: true });
	}

	buildCount(count: number) {
		return this.page.getByText(`×${count}`, { exact: true });
	}

	ability(ability: Ability) {
		return this.page.getByTestId(`${ability}-ability`);
	}

	abilityPoints(ap: number) {
		return this.page.getByText(`${ap}AP`, { exact: true });
	}
}
