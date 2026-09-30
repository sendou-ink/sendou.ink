import type { Page } from "@playwright/test";
import { navigate, submit } from "../../helpers/playwright";
import { TournamentBracketsPage } from "./tournament-brackets-page";

/** `/to/:id/join?code=...` — the page an invite link lands on. */
export class TournamentJoinPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	/** Invite links carry the production domain; only their path is navigated to. */
	async gotoViaInviteLink(inviteLink: string) {
		const url = new URL(inviteLink);
		await navigate({ page: this.page, url: url.pathname + url.search });
	}

	async join() {
		await submit(this.page);
		return new TournamentBracketsPage(this.page);
	}
}
