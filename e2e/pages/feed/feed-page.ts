import type { Page } from "@playwright/test";
import { newHomePageSchema } from "~/features/settings/settings-schemas";
import { SETTINGS_PAGE } from "~/utils/urls";
import {
	expect,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { FeedPostPage } from "./feed-post-page";

/** `/` as a feed tester who made the feed their home page */
export class FeedPage {
	private readonly page: Page;
	private readonly newHomePageForm;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.newHomePageForm = createFormHelpers(page, newHomePageSchema);
		this.locators = {
			heading: page.getByRole("heading", { name: "Home", level: 1 }),
			posts: page.getByRole("main").getByRole("article"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: "/" });
	}

	/** Turns the feed on as the home page from the settings' preferences tab. */
	async enableAsHomePage() {
		await navigate({
			page: this.page,
			url: `${SETTINGS_PAGE}?tab=preferences`,
		});
		await waitForPOSTResponse(this.page, () =>
			this.newHomePageForm.check("newValue"),
		);
	}

	post(text: string | RegExp) {
		return this.locators.posts.filter({ hasText: text });
	}

	async openPost(text: string | RegExp) {
		await this.post(text).getByRole("link", { name: "Comments" }).click();
		await this.page.waitForURL(/\/feed\//);
		const postPage = new FeedPostPage(this.page);
		await expect(postPage.locators.commentsRegion).toBeVisible();

		return postPage;
	}
}
