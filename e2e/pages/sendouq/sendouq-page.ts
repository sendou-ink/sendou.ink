import type { Page } from "@playwright/test";
import { SENDOUQ_PAGE, sendouQInviteLink } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { SendouQLookingPage } from "./sendouq-looking-page";
import { SendouQPreparingPage } from "./sendouq-preparing-page";

export class SendouQPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			joinWithMatesButton: page.getByRole("button", {
				name: "Join with mates",
			}),
			joinGroupDialog: page.getByRole("dialog"),
			joinGroupButton: page.getByRole("button", { name: "Join", exact: true }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: SENDOUQ_PAGE });
	}

	async gotoInviteLink(inviteCode: string) {
		await navigate({ page: this.page, url: sendouQInviteLink(inviteCode) });
	}

	async joinWithMates() {
		await this.locators.joinWithMatesButton.click();
		return new SendouQPreparingPage(this.page);
	}

	async joinSolo() {
		await submit(this.page, "join-solo-button");
		return new SendouQLookingPage(this.page);
	}

	/** Accepts the invite of the group the join link was made by. */
	async joinInvitedGroup() {
		await this.locators.joinGroupButton.click();
		return new SendouQPreparingPage(this.page);
	}
}
