import type { Page } from "@playwright/test";
import type { TierName } from "~/features/mmr/mmr-constants";
import { TIERS_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class TiersPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: TIERS_PAGE });
	}

	tierImage(tierName: TierName) {
		return this.page.getByRole("img", { name: tierName, exact: true });
	}
}
