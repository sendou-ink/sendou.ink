import type { Locator, Page } from "@playwright/test";
import { ADMIN_PAGE } from "~/utils/urls";
import {
	fillDateTimeField,
	navigate,
	selectUser,
	submit,
} from "../../helpers/playwright";

type PatronTierLabel = "Support" | "Supporter" | "Supporter+";

/** The staff action forms of the admin page, ban & unban excluded (see AdminBanPage). */
export class AdminActionsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: ADMIN_PAGE });
	}

	async updateFriendCode(userName: string, friendCode: string) {
		const form = this.form("Update friend code");
		await this.selectFormUser(form, userName);
		await form.getByLabel("Friend code").fill(friendCode);
		await this.submitForm(form, "Submit");
	}

	async linkPlayer(userName: string, playerId: number) {
		const form = this.form("Link player");
		await this.selectFormUser(form, userName);
		await form.getByLabel("Player ID").fill(String(playerId));
		await this.submitForm(form, "Link player");
	}

	async giveArtist(userName: string) {
		const form = this.form("Add as artist");
		await this.selectFormUser(form, userName);
		await this.submitForm(form, "Add as artist");
	}

	async giveVideoAdder(userName: string) {
		const form = this.form("Give video adder");
		await this.selectFormUser(form, userName);
		await this.submitForm(form, "Add as video adder");
	}

	async giveTournamentOrganizer(userName: string) {
		const form = this.form("Give tournament organizer");
		await this.selectFormUser(form, userName);
		await this.submitForm(form, "Add as tournament organizer");
	}

	async giveApiAccess(userName: string) {
		const form = this.form("Give API access");
		await this.selectFormUser(form, userName);
		await this.submitForm(form, "Grant API access");
	}

	async forcePatron(
		userName: string,
		{ tier, expiresAt }: { tier: PatronTierLabel; expiresAt: Date },
	) {
		const form = this.form("Force patron");
		await this.selectFormUser(form, userName);
		await form.getByLabel("Patron tier").selectOption({ label: tier });
		await fillDateTimeField({
			scope: form,
			label: "Patron until",
			date: expiresAt,
		});
		await this.submitForm(form, "Save");
	}

	async migrateUser({
		oldUserName,
		newUserName,
	}: {
		oldUserName: string;
		newUserName: string;
	}) {
		const form = this.form("Migrate user data");
		await selectUser({
			page: this.page,
			userName: oldUserName,
			labelName: "Old user",
			within: form,
		});
		await selectUser({
			page: this.page,
			userName: newUserName,
			labelName: "New user",
			within: form,
		});
		await this.submitForm(form, "Migrate");
	}

	async refreshPlusTiers() {
		await this.submitForm(this.form("Refresh Plus Tiers"), "Refresh");
	}

	/** Types into a user search and returns the top suggestion, for asserting data the search surfaces (e.g. plus tier). */
	async userSearchSuggestion(userName: string) {
		const form = this.form("Add as artist");
		await form.getByLabel("User").click();
		await this.page.getByTestId("user-search-input").fill(userName);
		return this.page.getByTestId("user-search-item").first();
	}

	async openFriendCodeLookUp() {
		await this.page.getByRole("tab", { name: "Friend code look-up" }).click();
	}

	async searchFriendCode(friendCode: string) {
		await this.page
			.getByRole("textbox", { name: "Friend code" })
			.fill(friendCode);
		// scoped by test id: a role query for "Search" would also hit the header's global search
		await this.page.getByTestId("submit-button").click();
	}

	foundUserLink(userName: string) {
		return this.page.getByRole("link", { name: userName });
	}

	private form(title: string) {
		return this.page.locator("form").filter({
			has: this.page.locator("h2", { hasText: new RegExp(`^${title}$`) }),
		});
	}

	private selectFormUser(form: Locator, userName: string) {
		return selectUser({
			page: this.page,
			userName,
			labelName: "User",
			within: form,
		});
	}

	private async submitForm(form: Locator, buttonText: string) {
		await submit(this.page, form.getByRole("button", { name: buttonText }));
	}
}
