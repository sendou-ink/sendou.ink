import type { Page } from "@playwright/test";
import { PLUS_VOTING_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class PlusVotingResultsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			heading: page.getByRole("heading", { name: /Voting results for/ }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: `${PLUS_VOTING_PAGE}/results` });
	}

	passedHeading(count: number) {
		return this.page.getByRole("heading", { name: `Passed (${count})` });
	}

	failedHeading(count: number) {
		return this.page.getByRole("heading", { name: `Didn't pass (${count})` });
	}

	userResult(username: string) {
		return this.page
			.getByRole("main")
			.getByRole("link", { name: username })
			.first();
	}

	/** The "S" marker rendered on results of users who were in the voting via a suggestion. */
	suggestedMarker(username: string) {
		return this.userResult(username).getByText("S", { exact: true });
	}

	/** The logged-in user's own "You passed/didn't pass the +X voting" line. */
	ownResult({ tier, passed }: { tier: number; passed: boolean }) {
		return this.page.locator("li").filter({
			hasText: `You ${passed ? "passed" : "didn't pass"} the +${tier} voting`,
		});
	}
}
