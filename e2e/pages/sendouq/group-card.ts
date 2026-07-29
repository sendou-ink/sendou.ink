import type { Locator } from "@playwright/test";

export class GroupCard {
	readonly root: Locator;
	readonly members: Locator;
	readonly actionButton: Locator;

	constructor(root: Locator) {
		this.root = root;
		this.members = root.getByTestId("sendouq-group-card-member");
		this.actionButton = root.getByTestId("group-card-action-button");
	}
}
