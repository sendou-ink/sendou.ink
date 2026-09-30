import type { Page } from "@playwright/test";
import { navigate } from "../../helpers/playwright";

/** The root error boundary (`Catcher`), rendered in place of a page. */
export class ErrorPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			root: page.getByTestId("error-page"),
			notFoundHeading: page.getByRole("heading", {
				name: "Error 404 - Page not found",
			}),
		};
	}

	async goto(url: string) {
		await navigate({ page: this.page, url });
	}

	async responseStatus(url: string) {
		const response = await this.page.request.get(url);
		return response.status();
	}

	heading(name: string | RegExp) {
		return this.locators.root.getByRole("heading", { name });
	}

	text(text: string | RegExp) {
		return this.locators.root.getByText(text);
	}
}
