import type { Page } from "@playwright/test";
import { tournamentAdminPage } from "~/utils/urls";
import {
	navigate,
	selectUser,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** `/to/:id/admin/staff` */
export class TournamentAdminStaffPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			authorRow: page.getByTestId("staff-author"),
			editButton: page.getByTestId("edit-staff-button"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: `${tournamentAdminPage(tournamentId)}/staff`,
		});
	}

	staffRow(username: string) {
		return this.page.getByTestId(`staff-row-${username}`);
	}

	/** The staff section is read-only until "Edit" reveals the form. */
	async edit() {
		await this.locators.editButton.click();
	}

	/** The form collapses back to the read-only view once the save POST lands. */
	async save() {
		await waitForPOSTResponse(this.page, async () => {
			await this.page.getByTestId("submit-button").click();
		});
	}

	/** The empty staff array already renders one placeholder row, so the user is selected into it. */
	async addStaffer(username: string, role?: string) {
		await this.edit();
		await selectUser({
			page: this.page,
			userName: username,
			labelName: "User",
		});
		if (role) {
			await this.page.getByLabel("Role", { exact: true }).selectOption(role);
		}
		await this.save();
	}

	async removeStaffer() {
		await this.edit();
		await this.page.getByRole("button", { name: "Remove item" }).click();
		await this.save();
	}
}
