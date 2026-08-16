import type { Locator } from "@playwright/test";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { modalClickConfirmButton, submit } from "../../helpers/playwright";
import { UserCard } from "../user/user-card";

export class GroupCard {
	readonly root: Locator;
	readonly members: Locator;
	readonly actionButton: Locator;
	readonly suggestButton: Locator;
	/** Note of who in the own group invited or suggested this group. */
	readonly trail: Locator;
	/** One per member who missed a ready check, and can thus be kicked. */
	readonly kickButtons: Locator;
	/** One per mode the match against this group would be played on. */
	readonly modes: Locator;

	constructor(root: Locator) {
		this.root = root;
		this.members = root.getByTestId("sendouq-group-card-member");
		this.actionButton = root.getByTestId("group-card-action-button");
		this.suggestButton = root.getByTestId("group-card-suggest-button");
		this.trail = root.getByTestId("group-card-trail");
		this.kickButtons = root.getByTestId("group-card-kick-button");
		this.modes = root.getByTestId(/^group-card-mode-/);
	}

	mode(mode: ModeShort) {
		return this.root.getByTestId(`group-card-mode-${mode}`);
	}

	/** Challenges or invites the group, accepts what it offered, or undoes either. */
	pressAction() {
		return submit(this.root.page(), this.actionButton);
	}

	pressSuggest() {
		return submit(this.root.page(), this.suggestButton);
	}

	/** Kicks the first member the card offers a kick button for, confirming the dialog. */
	async pressKick() {
		await this.kickButtons.first().click();
		await modalClickConfirmButton(this.root.page());
	}

	openMemberCard(name: string) {
		return UserCard.open(
			this.root.page(),
			this.root.getByRole("button", { name }),
		);
	}
}
