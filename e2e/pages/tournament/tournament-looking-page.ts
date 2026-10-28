import type { Page } from "@playwright/test";
import { joinQueueFormSchema } from "~/features/tournament-lfg/tournament-lfg-schemas";
import { tournamentSubsPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/to/:id/looking` — the groups view shown while registration is still open. */
export class TournamentLookingPage {
	private readonly page: Page;
	private readonly stayAsSubSwitchLabel;
	readonly joinQueueForm;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.joinQueueForm = createFormHelpers(page, joinQueueFormSchema);
		this.stayAsSubSwitchLabel = page.getByTestId("stay-as-sub-switch");
		this.locators = {
			// narrow screens keep the other tabs' cards in the DOM, hidden
			groupCards: page.getByTestId("lfg-group-card").filter({ visible: true }),
			stayAsSubSwitch: this.stayAsSubSwitchLabel.getByRole("switch"),
			/** The player's own match profile, shown on the join form. */
			matchProfileSummary: page.getByTestId("match-profile-summary"),
			lookForTeamButton: page.getByRole("button", { name: "Look for a team" }),
			lookForMoreMembersButton: page.getByRole("button", {
				name: "Look for more members",
			}),
			stopLookingButton: page.getByRole("button", { name: "Stop looking" }),
		};
	}

	goto(tournamentId: number) {
		return navigate({ page: this.page, url: tournamentSubsPage(tournamentId) });
	}

	/** The own group's card, always the first one on the page. */
	get ownGroupCard() {
		return this.locators.groupCards.first();
	}

	/** The card of the group the user is in. */
	groupOf(username: string) {
		return this.locators.groupCards.filter({ hasText: username });
	}

	/** A weapon of the user's match profile, on their group's card. */
	weaponOf(username: string, weaponName: string) {
		return this.groupOf(username).getByRole("img", { name: weaponName });
	}

	/** The user's voice chat status on their group's card, opening a popover listing their languages. */
	voiceChatButtonOf(username: string, status: string) {
		return this.groupOf(username).getByRole("button", { name: status });
	}

	/** A weapon of the player's own match profile, on the join form. */
	matchProfileWeapon(weaponName: string) {
		return this.locators.matchProfileSummary.getByRole("img", {
			name: weaponName,
		});
	}

	visibleText(text: string) {
		return this.page.getByText(text).filter({ visible: true });
	}

	/** Puts the user's registered team in the queue, as its owner or a manager. */
	lookForMoreMembers() {
		return submit(this.page, this.locators.lookForMoreMembersButton);
	}

	/** Leaves the queue, confirming the dialog. */
	async stopLooking() {
		await this.locators.stopLookingButton.click();
		await modalClickConfirmButton(this.page);
	}

	toggleStayAsSub() {
		return waitForPOSTResponse(this.page, () =>
			// the switch input itself is visually hidden behind its indicator
			this.stayAsSubSwitchLabel.click(),
		);
	}

	inviteButtonOf(username: string) {
		return this.groupButton(username, "Invite");
	}

	/** Shown on the card of a group the own group has invited. */
	undoButtonOf(username: string) {
		return this.groupButton(username, "Undo");
	}

	inviteGroupOf(username: string) {
		return submit(this.page, this.inviteButtonOf(username));
	}

	/** Withdraws the invitation given to the user's group. */
	undoInvitationOf(username: string) {
		return submit(this.page, this.undoButtonOf(username));
	}

	/** Shown on the card of a group that has invited the own group. */
	acceptButtonOf(username: string) {
		return this.groupButton(username, "Accept");
	}

	/** Accepts the invitation of the user's group, merging it with the own group. */
	acceptInvitationOf(username: string) {
		return submit(this.page, this.acceptButtonOf(username));
	}

	/** Takes the user's group out of the queue, as an organizer. */
	async removeGroupOf(username: string) {
		await this.groupOf(username)
			.getByRole("button", { name: "Delete" })
			.click();
		await modalClickConfirmButton(this.page);
	}

	private groupButton(username: string, name: string) {
		return this.groupOf(username).getByRole("button", { name, exact: true });
	}
}
