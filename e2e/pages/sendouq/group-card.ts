import type { Locator } from "@playwright/test";
import { submit } from "../../helpers/playwright";
import { UserCard } from "../user/user-card";

export class GroupCard {
	readonly root: Locator;
	readonly members: Locator;
	readonly actionButton: Locator;
	readonly suggestButton: Locator;
	/** Note of who in the own group invited or suggested this group. */
	readonly trail: Locator;

	constructor(root: Locator) {
		this.root = root;
		this.members = root.getByTestId("sendouq-group-card-member");
		this.actionButton = root.getByTestId("group-card-action-button");
		this.suggestButton = root.getByTestId("group-card-suggest-button");
		this.trail = root.getByTestId("group-card-trail");
	}

	/** Challenges or invites the group, accepts what it offered, or undoes either. */
	pressAction() {
		return submit(this.root.page(), this.actionButton);
	}

	pressSuggest() {
		return submit(this.root.page(), this.suggestButton);
	}

	openMemberCard(name: string) {
		return UserCard.open(
			this.root.page(),
			this.root.getByRole("button", { name }),
		);
	}
}
