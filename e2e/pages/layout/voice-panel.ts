import { expect, type Page } from "@playwright/test";

export class VoicePanel {
	readonly locators;

	constructor(page: Page) {
		const panel = page.getByRole("dialog").filter({
			has: page.getByRole("button", { name: /^(Join|Leave) voice$/ }),
		});

		this.locators = {
			toggleButton: page
				.getByRole("banner")
				.getByRole("button", { name: "Voice", exact: true }),
			panel,
			/** The section of the call the user is in. */
			callSection: panel
				.locator("section")
				.filter({ has: page.getByRole("button", { name: "Leave voice" }) }),
			leaveVoiceButton: panel.getByRole("button", { name: "Leave voice" }),
		};
	}

	async open() {
		if (await this.locators.panel.isVisible()) return;

		await this.locators.toggleButton.click();
		await expect(this.locators.panel).toBeVisible();
	}

	/** The section of a room whose call the user is not in. */
	joinableRoom(title: string | RegExp) {
		return this.locators.panel.locator("section").filter({
			hasText: title,
			has: this.locators.panel.page().getByRole("button", {
				name: "Join voice",
			}),
		});
	}

	/** Joins the call of the room titled `title`, waiting until connected. */
	async joinVoice(title: string | RegExp) {
		await this.open();
		await this.joinableRoom(title)
			.getByRole("button", { name: "Join voice" })
			.click();
		await expect(this.locators.callSection).toContainText("Voice connected");
	}
}
