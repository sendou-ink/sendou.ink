import type { Page } from "@playwright/test";
import { associationsPage } from "~/features/associations/associations-urls";
import { invariant } from "~/utils/invariant";
import {
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";

export class AssociationsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			deleteButtons: page.getByTestId("delete-association"),
			leaveButton: page.getByTestId("leave-team-button"),
			inviteLinkInputs: page.getByLabel("Share link to add members"),
			resetLinkButton: page.getByText("Reset link"),
			confirmButton: page.getByTestId("confirm-button"),
			deleteBlockedMessage: page.getByText(/can't be deleted while/),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: associationsPage() });
	}

	async gotoInvite(inviteCode: string) {
		await navigate({ page: this.page, url: associationsPage(inviteCode) });
	}

	heading(name: string) {
		return this.page.getByRole("heading").filter({ hasText: name });
	}

	/** The share link is shown as the whole production url, only its code is of use here. */
	async inviteCode() {
		const inviteLink = await this.locators.inviteLinkInputs
			.first()
			.inputValue();
		const inviteCode = new URL(inviteLink).searchParams.get("inviteCode");
		invariant(inviteCode, `No invite code in the share link: ${inviteLink}`);

		return inviteCode;
	}

	async join() {
		await submit(this.page);
	}

	async deleteFirst() {
		await this.openDeleteFirst();
		await modalClickConfirmButton(this.page);
	}

	async openDeleteFirst() {
		await this.locators.deleteButtons.first().click();
	}

	/** The star that lets the member share the invite link, or takes that away. */
	async toggleManager(username: string) {
		await this.page
			.getByRole("button", { name: username, exact: false })
			.click();
	}

	async leave() {
		await this.locators.leaveButton.click();
		await modalClickConfirmButton(this.page);
	}
}
