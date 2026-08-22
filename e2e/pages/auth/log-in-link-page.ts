import type { Page } from "@playwright/test";
import { navigate } from "../../helpers/playwright";

/** `/auth/login?code=...`, the single use log in links the Lohi bot hands out. */
export class LogInLinkPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(code: string) {
		await navigate({ page: this.page, url: `/auth/login?code=${code}` });
	}

	/** An invalid link is served as a plain-text error response, not an app page. */
	async fetchResponse(code: string) {
		const response = await this.page.request.get(`/auth/login?code=${code}`);
		return { status: response.status(), body: await response.text() };
	}
}
