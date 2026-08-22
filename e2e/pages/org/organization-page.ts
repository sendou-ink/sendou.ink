import type { Page } from "@playwright/test";
import {
	banUserActionSchema,
	updateIsEstablishedSchema,
} from "~/features/tournament-organization/tournament-organization-schemas";
import { tournamentOrganizationPage } from "~/features/tournament-organization/tournament-organization-urls";
import {
	modalClickConfirmButton,
	navigate,
	selectUser,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { OrganizationEditPage } from "./organization-edit-page";
import { OrganizationStatsPage } from "./organization-stats-page";

export class OrganizationPage {
	private readonly page: Page;
	private readonly isEstablishedForm;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.isEstablishedForm = createFormHelpers(page, updateIsEstablishedSchema);
		this.locators = {
			editButton: page.getByTestId("edit-org-button"),
			statsButton: page.getByTestId("org-stats-button"),
			bannedUsersTab: page.getByTestId("banned-users-tab"),
			adminTab: page.getByRole("tab", { name: "Admin" }),
			newBanButton: page.getByRole("button", { name: "New ban" }),
			unbanButton: page.getByRole("button", { name: "Unban" }),
			bannedUsersTable: page.getByRole("table"),
		};
	}

	async goto(organizationSlug: string) {
		await navigate({
			page: this.page,
			url: tournamentOrganizationPage({ organizationSlug }),
		});
	}

	async openEdit() {
		await this.locators.editButton.click();
		return new OrganizationEditPage(this.page);
	}

	async openStats() {
		await this.locators.statsButton.click();
		return new OrganizationStatsPage(this.page);
	}

	/** Established organizations can add tournaments and their admins can edit them. */
	async establish() {
		await this.locators.adminTab.click();
		await waitForPOSTResponse(this.page, () =>
			this.isEstablishedForm.check("isEstablished"),
		);
	}

	async openBannedUsers() {
		await this.locators.bannedUsersTab.click();
	}

	async openBanModal() {
		await this.locators.newBanButton.click();
		return new BanUserDialog(this.page);
	}

	async unban() {
		await this.locators.unbanButton.click();
		await modalClickConfirmButton(this.page);
	}
}

class BanUserDialog {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, banUserActionSchema);
		this.locators = {
			dialog: page.getByRole("dialog"),
		};
	}

	/** Scoped to the dialog: the tab panel behind it carries the label too. */
	async selectUser(userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: "Player",
			within: this.locators.dialog,
		});
	}

	async save() {
		await submit(this.page);
	}
}
