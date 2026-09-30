import type { Page } from "@playwright/test";
import { format } from "date-fns";

export class OrganizationStatsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			establishedStatus: page.getByRole("progressbar", {
				name: "Established status",
			}),
		};
	}

	/** The month's row of the participant breakdown, e.g. "Jul 2026". */
	monthRow(month: Date) {
		return this.page.getByRole("progressbar", {
			name: format(month, "MMM yyyy"),
		});
	}
}
