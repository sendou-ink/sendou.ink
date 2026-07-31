import type { Page } from "@playwright/test";
import { JOIN_CODE_SEARCH_PARAM_KEY } from "~/features/sendouq/q-constants";
import invariant from "~/utils/invariant";
import { SENDOUQ_PREPARING_PAGE } from "~/utils/urls";
import { expect, navigate } from "../../helpers/playwright";
import { GroupCard } from "./group-card";
import { SendouQLookingPage } from "./sendouq-looking-page";

export class SendouQPreparingPage {
	private readonly page: Page;
	readonly locators;
	readonly groupCard: GroupCard;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			inviteLinkInput: page.getByLabel("Invite link"),
			friendSelect: page.getByLabel("Quick add"),
			// the button is icon only, so there is no accessible name to find it by
			addFriendButton: page.locator(
				'button[type="submit"][value="ADD_FRIEND"]',
			),
			joinQueueButton: page.getByRole("button", { name: "Join the queue" }),
		};
		this.groupCard = new GroupCard(
			page.getByTestId("sendouq-group-card").first(),
		);
	}

	async goto() {
		await navigate({ page: this.page, url: SENDOUQ_PREPARING_PAGE });
	}

	/** The code of the invite link, for joining the group without being a friend. */
	async inviteCode() {
		const inviteLink = await this.locators.inviteLinkInput.inputValue();
		const code = new URL(inviteLink).searchParams.get(
			JOIN_CODE_SEARCH_PARAM_KEY,
		);
		invariant(code, `No invite code in the invite link: ${inviteLink}`);

		return code;
	}

	/** Adds the first friend the quick add dropdown offers to the group. */
	async addFirstFriend() {
		await this.locators.friendSelect.selectOption({ index: 1 });
		await expect(this.locators.addFriendButton).toBeEnabled();
		await this.locators.addFriendButton.click();
	}

	async joinQueue() {
		await this.locators.joinQueueButton.click();
		return new SendouQLookingPage(this.page);
	}
}
