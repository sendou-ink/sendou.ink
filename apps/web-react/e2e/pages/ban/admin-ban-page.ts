import type { Locator, Page } from "@playwright/test";
import { ADMIN_PAGE } from "~/utils/urls";
import {
	navigate,
	selectUser,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** The ban & unban forms of the admin page. */
export class AdminBanPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			banForm: page
				.locator("form")
				.filter({ has: page.locator("h2", { hasText: /^Ban user$/ }) }),
			unbanForm: page
				.locator("form")
				.filter({ has: page.locator("h2", { hasText: /^Unban user$/ }) }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: ADMIN_PAGE });
	}

	async banUser(
		userName: string,
		options: { expiresAt?: Date; reason?: string } = {},
	) {
		const form = this.locators.banForm;

		await selectUser({
			page: this.page,
			userName,
			labelName: "User",
			within: form,
		});

		if (options.expiresAt) {
			await this.fillExpiresAt(options.expiresAt);
		}
		if (options.reason) {
			await form.getByLabel("Reason").fill(options.reason);
		}

		await this.save(form);
	}

	async unbanUser(userName: string) {
		const form = this.locators.unbanForm;

		await selectUser({
			page: this.page,
			userName,
			labelName: "User",
			within: form,
		});

		await this.save(form);
	}

	private async fillExpiresAt(expiresAt: Date) {
		const fillSegment = (segment: string, value: string) =>
			this.locators.banForm
				.getByRole("spinbutton", {
					name: new RegExp(`^${segment}, Ban expiration date`),
				})
				.fill(value);

		const hours = expiresAt.getHours();
		await fillSegment("year", String(expiresAt.getFullYear()));
		await fillSegment("month", String(expiresAt.getMonth() + 1));
		await fillSegment("day", String(expiresAt.getDate()));
		await fillSegment("hour", String(hours % 12 || 12));
		await fillSegment(
			"minute",
			String(expiresAt.getMinutes()).padStart(2, "0"),
		);
		await fillSegment("AM/PM", hours >= 12 ? "PM" : "AM");
	}

	private async save(form: Locator) {
		await waitForPOSTResponse(this.page, () =>
			form.getByRole("button", { name: "Save" }).click(),
		);
	}
}
