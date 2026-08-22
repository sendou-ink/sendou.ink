import type { Page } from "@playwright/test";
import {
	expect,
	fillDateTimeField,
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";

/** `/admin/streams`, where external (non-Twitch) streams are managed. */
export class AdminStreamsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			addStreamHeading: page.getByRole("heading", {
				name: "Add external stream",
			}),
			noStreams: page.getByText("No external streams"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: "/admin/streams" });
	}

	streamLink(name: string) {
		return this.page.getByRole("link", { name });
	}

	async createStream({
		name,
		url,
		startTime,
		logoPath,
	}: {
		name: string;
		url: string;
		startTime: Date;
		logoPath: string;
	}) {
		const form = this.form();
		await form.getByLabel("Name").fill(name);
		await form.getByLabel("Link").fill(url);
		await form.getByLabel("Logo").setInputFiles(logoPath);
		// the logo compresses in the browser; submitting before the preview shows loses it
		await expect(form.locator("img")).toBeVisible();
		await fillDateTimeField({
			scope: form,
			label: "Start time",
			date: startTime,
		});
		await submit(this.page, form.getByRole("button", { name: "Submit" }));
	}

	async deleteStream(name: string) {
		await this.page
			.getByRole("listitem")
			.filter({ hasText: name })
			.getByRole("button", { name: "Delete" })
			.click();
		await modalClickConfirmButton(this.page);
	}

	private form() {
		return this.page.locator("form").filter({
			has: this.page.locator("h2", { hasText: /^Add external stream$/ }),
		});
	}
}
