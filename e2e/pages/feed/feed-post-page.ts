import type { Page } from "@playwright/test";
import {
	expectIsHydrated,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** `/feed/:id` */
export class FeedPostPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		const comments = page.getByRole("region", { name: "Comments" });
		this.locators = {
			post: page.getByRole("main").getByRole("article"),
			comments: comments.getByTestId("chat-message-row"),
			noCommentsText: page.getByText("No comments yet. Say something nice!"),
			composer: comments.getByPlaceholder("Press enter to send"),
			reactButton: page.getByRole("button", { name: "Booyah" }),
			shareButton: page.getByRole("button", { name: "Share" }),
		};
	}

	/** Copies the link that shows the post as the sharer sees it and reads it off the clipboard. */
	async copyShareLink(): Promise<string> {
		await this.locators.shareButton.click();
		return this.page.evaluate("navigator.clipboard.readText()");
	}

	/** Share links carry the site's domain; only their path is navigated to. */
	async gotoViaShareLink(shareLink: string) {
		const url = new URL(shareLink);
		await navigate({ page: this.page, url: url.pathname + url.search });
	}

	async comment(contents: string) {
		await this.locators.composer.fill(contents);
		await waitForPOSTResponse(this.page, () =>
			this.locators.composer.press("Enter"),
		);
	}

	async toggleReaction() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.reactButton.click(),
		);
	}

	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}
}
