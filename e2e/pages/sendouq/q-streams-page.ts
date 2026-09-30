import type { Page } from "@playwright/test";
import { SENDOUQ_STREAMS_PAGE, twitchUrl } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class QStreamsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			noStreamsText: page.getByText("No streamed matches currently"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: SENDOUQ_STREAMS_PAGE });
	}

	streamerLink(username: string) {
		return this.page.getByRole("link", { name: username });
	}

	matchLink(matchId: number) {
		return this.page.getByRole("link", { name: `#${matchId}`, exact: true });
	}

	twitchLink(accountName: string) {
		return this.page.locator(`a[href="${twitchUrl(accountName)}"]`);
	}

	viewerCount(count: number) {
		return this.page.getByText(String(count), { exact: true });
	}
}
