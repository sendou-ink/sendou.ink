import type { Page } from "@playwright/test";
import { PLUS_VOTING_PAGE } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";

export class PlusVotingPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			upvoteButton: page.getByRole("button", { name: "+1", exact: true }),
			submitVotesButton: page.getByRole("button", { name: "Submit votes" }),
			votedAlert: page.getByText("You have voted"),
			votingStartsInfo: page.getByText("Next voting starts"),
			votingOngoingInfo: page.getByText("Voting is currently happening"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: PLUS_VOTING_PAGE });
	}

	async upvoteCurrent() {
		await this.locators.upvoteButton.click();
	}

	async submitVotes() {
		await submit(this.page, this.locators.submitVotesButton);
	}
}
