import type { Page } from "@playwright/test";
import { userResultsEditHighlightsPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";

/** `/u/:identifier/results/highlights` */
export class UserResultsHighlightsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(discordId: string) {
		await navigate({
			page: this.page,
			url: userResultsEditHighlightsPage({ discordId }),
		});
	}

	/** A result's highlight checkbox, labeled by the event name and placement. */
	resultCheckbox(resultName: RegExp) {
		return this.page.getByRole("checkbox", { name: resultName });
	}

	async save() {
		await submit(this.page);
	}
}
