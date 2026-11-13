import type { Page } from "@playwright/test";
import { badgePage } from "~/utils/urls";
import {
	navigate,
	selectUser,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** `/badges/:id` */
export class BadgePage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			/** What the badge is awarded for, e.g. "Awarded for winning In The Zone". */
			explanation: this.page.getByTestId("badge-explanation"),
			/** "Managed by … (made by …)" */
			credits: this.page.getByTestId("badge-credits"),
			/** Shown to the badge's managers and to staff. */
			editLink: this.page.getByRole("link", { name: "Edit", exact: true }),
			owners: this.page.getByTestId("badge-owners"),
		};
	}

	async goto(badgeId: number) {
		await navigate({ page: this.page, url: badgePage(badgeId) });
	}

	/** A user named in the credits, as a manager of the badge or as who drew it. */
	creditedUser(username: string) {
		return this.locators.credits.getByRole("link", {
			name: username,
			exact: true,
		});
	}

	/** The owner's row, showing "×N" when they own more than one copy. */
	owner(username: string) {
		return this.locators.owners
			.getByRole("listitem")
			.filter({ hasText: username });
	}

	async openEdit() {
		await this.locators.editLink.click();
		return new BadgeEditDialog(this.page);
	}
}

/** `/badges/:id/edit`, the dialog where managers edit the owners and staff the managers */
class BadgeEditDialog {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		const dialog = this.page.getByRole("dialog");
		const ownersEditor = dialog.getByTestId("badge-owners-editor");
		const managersEditor = dialog.getByTestId("badge-managers-editor");
		this.locators = {
			dialog,
			ownersEditor,
			/** Only shown to staff. */
			managersEditor,
			ownersSubmitButton: ownersEditor.getByRole("button", { name: "Submit" }),
			managersSubmitButton: managersEditor.getByRole("button", {
				name: /^Submit/,
			}),
		};
	}

	/** Gives the user a copy of the badge, one more if they already own it. */
	async addOwner(userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: "Add new owner",
		});
	}

	/** Sets how many copies of the badge the owner has, 0 removing them as an owner. */
	async setCopies(userName: string, count: number) {
		await this.locators.ownersEditor
			.getByRole("spinbutton", { name: `Copies owned by ${userName}` })
			.fill(String(count));
	}

	/** The summary of a pending change to the owners, e.g. "1 added to Sendou". */
	ownerChange(text: string) {
		return this.locators.ownersEditor.getByRole("listitem").filter({
			hasText: text,
		});
	}

	async saveOwners() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.ownersSubmitButton.click(),
		);
	}

	async addManager(userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: "Add new manager",
		});
	}

	async saveManagers() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.managersSubmitButton.click(),
		);
	}
}
