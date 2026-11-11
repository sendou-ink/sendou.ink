import type { Page } from "@playwright/test";
import { associationsPage } from "~/features/associations/associations-urls";
import { invariant } from "~/utils/invariant";
import {
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";
import { ScrimsPage } from "../scrims/scrims-page";

/** `/associations`: the viewer's associations with their members, and the prompt to join one an invite link leads to. */
export class AssociationsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			deleteButtons: page.getByTestId("delete-association"),
			leaveButton: page.getByTestId("leave-team-button"),
			inviteLinkInputs: page.getByLabel("Share link to add members"),
			resetLinkButton: page.getByRole("button", { name: "Reset link" }),
			joinButton: page.getByRole("button", { name: "Join", exact: true }),
			removeMemberButtons: page.getByRole("button", { name: /^Remove / }),
			leaveDialogHeading: page.getByRole("dialog").getByRole("heading"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: associationsPage() });
	}

	/** Opens the association's invite link. */
	async openInviteLink(inviteCode: string) {
		await navigate({ page: this.page, url: associationsPage(inviteCode) });
	}

	heading(name: string) {
		return this.page.getByRole("heading").filter({ hasText: name });
	}

	/** The "Admin: …" line under the association's name. */
	adminLine(username: string) {
		return this.page.getByText(`Admin: ${username}`);
	}

	/** The share link is shown as the whole production url, only its code is of use here. */
	async copyInviteCode() {
		const inviteLink = await this.locators.inviteLinkInputs
			.first()
			.inputValue();
		const inviteCode = new URL(inviteLink).searchParams.get("inviteCode");
		invariant(inviteCode, `No invite code in the share link: ${inviteLink}`);

		return inviteCode;
	}

	/** Gives the association's invite link a new code, the old link no longer offering to join. */
	async resetInviteLink() {
		await this.locators.resetLinkButton.click();
	}

	async join() {
		await submit(this.page);
	}

	async deleteFirst() {
		await this.locators.deleteButtons.first().click();
		await modalClickConfirmButton(this.page);
	}

	/** Stars the member, letting them share the invite link and remove unstarred members. */
	async star(username: string) {
		await submit(
			this.page,
			this.page.getByRole("button", { name: `Star ${username}`, exact: true }),
		);
	}

	removeMemberButton(username: string) {
		return this.page.getByRole("button", {
			name: `Remove ${username}`,
			exact: true,
		});
	}

	async removeMember(username: string) {
		await this.removeMemberButton(username).click();
		await modalClickConfirmButton(this.page);
	}

	/** Opens the confirmation of leaving, which names the member taking over as the admin. */
	async startLeaving() {
		await this.locators.leaveButton.click();
	}

	async leave() {
		await this.startLeaving();
		await this.confirmLeaving();
	}

	async confirmLeaving() {
		await modalClickConfirmButton(this.page);
	}

	/** Opens the scrims page narrowed down to the posts limited to the association. */
	async viewScrims() {
		await this.page.getByRole("link", { name: "View scrims" }).click();
		return new ScrimsPage(this.page);
	}
}
