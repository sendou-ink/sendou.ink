import type { Page } from "@playwright/test";
import { tournamentResultsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { UserCard } from "../user/user-card";

/** `/to/:id/results` */
export class TournamentResultsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			showResultsButton: page.getByRole("button", { name: "Show results" }),
			resultTeamNames: page.getByTestId("result-team-name"),
			teamMemberNames: page.getByTestId("team-member-name"),
			// seed performance rating, shown only after the tournament is finalized
			sprHeader: page.getByTestId("spr-header"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: tournamentResultsPage(tournamentId),
		});
	}

	/** Expands a team's row so its members show. */
	async expandTeam(nth: number) {
		await this.locators.resultTeamNames.nth(nth).click();
	}

	/** Opens the user page of a member of the expanded team through their user card. */
	async openMember(nth: number) {
		const card = await UserCard.open(
			this.page,
			this.locators.teamMemberNames.nth(nth),
		);
		return card.openUserPage();
	}
}
