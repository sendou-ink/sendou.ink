import type { Page } from "@playwright/test";
import { SCANNER_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/scanner` */
export class ScannerPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: SCANNER_PAGE });
	}
}
