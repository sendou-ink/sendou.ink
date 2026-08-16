import type { Page } from "@playwright/test";
import { teamPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { TeamEditPage } from "./team-edit-page";
import { TeamRosterPage } from "./team-roster-page";

export class TeamPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			bio: page.getByTestId("team-bio"),
			bskyLink: page.getByTestId("bsky-link").first(),
			manageRosterButton: page.getByTestId("manage-roster-button"),
			editTeamButton: page.getByTestId("edit-team-button"),
			actionsMenuButton: page.getByTestId("team-actions-menu-button"),
			mainTeamIndicator: page.getByTestId("main-team-indicator"),
			makeMainTeamButton: page.getByTestId("make-main-team-button"),
			leaveTeamButton: page.getByTestId("leave-team-button"),
			deleteTeamButton: page.getByTestId("delete-team-button"),
			otherRolesTab: page.getByRole("tab", { name: /Other/ }),
			confirmDialog: page.getByRole("dialog"),
		};
	}

	async goto(customUrl: string) {
		await navigate({ page: this.page, url: teamPage(customUrl) });
	}

	memberRole(nth: number) {
		return this.page.getByTestId(`member-row-role-${nth}`);
	}

	ownerBadge(userId: number) {
		return this.page.getByTestId(`member-owner-${userId}`);
	}

	customRole(name: string) {
		return this.page.getByText(name).first();
	}

	async openManageRoster() {
		await this.locators.manageRosterButton.click();
		return new TeamRosterPage(this.page);
	}

	async openEdit() {
		await this.locators.editTeamButton.click();
		return new TeamEditPage(this.page);
	}

	async openActionsMenu() {
		await this.locators.actionsMenuButton.click();
	}

	/** Requires the actions menu to be open. */
	async makeMainTeam() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.makeMainTeamButton.click(),
		);
	}

	/**
	 * Opens the leave confirmation dialog, which names the new owner if the
	 * leaver owns the team. Requires the actions menu to be open.
	 */
	async startLeaving() {
		await this.locators.leaveTeamButton.click();
	}

	async confirmLeaving() {
		await modalClickConfirmButton(this.page);
	}

	/** Requires the actions menu to be open. */
	async leave() {
		await this.startLeaving();
		await this.confirmLeaving();
	}

	/** Requires the actions menu to be open. */
	async delete() {
		await this.locators.deleteTeamButton.click();
		await modalClickConfirmButton(this.page);
	}
}
