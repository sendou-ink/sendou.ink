import type { Page } from "@playwright/test";
import type {
	MemberRole,
	MemberRoleType,
} from "~/features/team/team-constants";
import type { CUSTOM_ROLE_VALUE } from "~/features/team/team-schemas";
import { manageTeamRosterPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";

export class TeamRosterPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			inviteLink: page.getByTestId("invite-link"),
			editorToggles: page.getByLabel("Editor"),
		};
	}

	async goto(customUrl: string) {
		await navigate({ page: this.page, url: manageTeamRosterPage(customUrl) });
	}

	memberRow(nth: number) {
		return new MemberRow(this.page, nth);
	}

	inviteLink() {
		return this.locators.inviteLink.innerText();
	}

	async resetInviteLink() {
		await submit(this.page, "reset-invite-link-button");
	}

	/** The owner and the user themselves can't be made editors, so they have no toggle. */
	async makeEditor(nth: number) {
		await this.locators.editorToggles.nth(nth).click({ force: true });
	}

	async save() {
		await submit(this.page);
	}
}

class MemberRow {
	private readonly row;
	/** The array field's wrapper, holding the reorder & remove buttons. */
	private readonly fieldset;
	readonly locators;

	constructor(page: Page, index: number) {
		this.row = page.getByTestId(`member-row-${index}`);
		this.fieldset = page.locator(
			`fieldset:has([data-testid='member-row-${index}'])`,
		);
		this.locators = {
			row: this.row,
			username: page.getByTestId(`member-row-username-${index}`),
			roleSelect: this.row.locator("select").first(),
			customRoleInput: this.row.getByRole("textbox"),
			roleTypeSelect: this.row.locator("select").nth(1),
			removeButton: this.fieldset.getByRole("button", { name: "Remove item" }),
			moveUpButton: this.fieldset.getByRole("button", { name: "Move up" }),
			moveDownButton: this.fieldset.getByRole("button", { name: "Move down" }),
		};
	}

	async selectRole(role: MemberRole | typeof CUSTOM_ROLE_VALUE) {
		await this.locators.roleSelect.selectOption(role);
	}

	async setCustomRole(name: string, roleType: MemberRoleType) {
		await this.selectRole("CUSTOM");
		await this.locators.customRoleInput.fill(name);
		await this.locators.roleTypeSelect.selectOption(roleType);
	}

	async remove() {
		await this.locators.removeButton.click();
	}

	async moveDown() {
		await this.locators.moveDownButton.click();
	}
}
