import type { Locator } from "@playwright/test";
import { UserCard } from "../user/user-card";

export class GroupCard {
	readonly root: Locator;
	readonly members: Locator;
	readonly actionButton: Locator;

	constructor(root: Locator) {
		this.root = root;
		this.members = root.getByTestId("sendouq-group-card-member");
		this.actionButton = root.getByTestId("group-card-action-button");
	}

	openMemberCard(name: string) {
		return UserCard.open(
			this.root.page(),
			this.root.getByRole("button", { name }),
		);
	}
}
