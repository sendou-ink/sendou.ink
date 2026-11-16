import type { Page } from "@playwright/test";
import { tournamentBroadcastsPage } from "~/features/broadcast/broadcast-urls";
import { navigate, submit } from "../../helpers/playwright";

/** `/to/:id/broadcast`, redirecting to a cast channel's dashboard, or adding the first channel when there is none. */
export class BroadcastPage {
	private readonly page: Page;
	private readonly tournamentId: number;
	readonly locators;

	constructor(page: Page, tournamentId: number) {
		this.page = page;
		this.tournamentId = tournamentId;
		this.locators = {
			accountInput: page.getByPlaceholder("dappleproductions"),
		};
	}

	async goto() {
		await navigate({
			page: this.page,
			url: tournamentBroadcastsPage(this.tournamentId),
		});
	}

	/** Adds the tournament's first cast channel from the empty page. */
	async addChannel(account: string) {
		await this.locators.accountInput.fill(account);
		await submit(this.page, "add-cast-channel-button");
	}
}
