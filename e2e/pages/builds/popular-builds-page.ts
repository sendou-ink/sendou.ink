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

	playersCount(count: number) {
		return this.page.getByText(`${count} players`, { exact: true });
	}

	buildAbility({ rank, ability }: { rank: number; ability: Ability }) {
		return this.page
			.getByRole("listitem")
			.filter({ has: this.placement(rank) })
			.getByTestId(`${ability}-ability`);
	}
}
