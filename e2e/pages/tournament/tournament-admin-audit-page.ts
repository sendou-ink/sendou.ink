import type { Page } from "@playwright/test";
import { tournamentAdminPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/to/:id/admin/audit` */
export class TournamentAdminAuditPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: `${tournamentAdminPage(tournamentId)}/audit`,
		});
	}

	/** A table cell, not the event-filter `<option>`s sharing the same text. */
	eventCell(name: string) {
		return this.page.getByRole("cell", { name });
	}
}
