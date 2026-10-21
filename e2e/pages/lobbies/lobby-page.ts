import type { Page } from "@playwright/test";
import { lobbyPage } from "~/utils/urls";
import {
	expect,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";

type Tab = "rosters" | "action" | "result" | "leaderboard";

const TAB_NAMES: Record<Tab, string> = {
	rosters: "Rosters",
	action: "Action",
	result: "Result",
	leaderboard: "Rankings",
};

/** A lobby: sign up and check in, then its sets on the shared match page. */
export class LobbyPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			signUpButton: page.getByTestId("lobby-sign-up-button"),
			checkInButton: page.getByTestId("lobby-check-in-button"),
			leaveButton: page.getByTestId("lobby-leave-button"),
			viewerStatus: page.getByTestId("lobby-viewer-status"),
			participants: page.getByTestId("lobby-participant"),
			reportScoreButton: page.getByTestId("report-score-button"),
			confirmSetEndButton: page.getByTestId("confirm-set-end-button"),
			confirmSetButton: page.getByTestId("lobby-confirm-set-button"),
			leaderboardRows: page.getByTestId("lobby-leaderboard-row"),
			endLobbyButton: page.getByTestId("lobby-end-button"),
			endedBanner: page.getByTestId("lobby-ended-banner"),
			selectedWinner: page.locator(
				'[data-testid^="winner-radio-"][data-selected="true"]',
			),
		};
	}

	async goto(lobbyId: number, tab?: Tab) {
		await navigate({
			page: this.page,
			url: tab ? `${lobbyPage(lobbyId)}?tab=${tab}` : lobbyPage(lobbyId),
		});
	}

	heading(name: string) {
		return this.page.getByRole("heading", { name, exact: true });
	}

	async openTab(tab: Tab) {
		await this.page.getByRole("tab", { name: TAB_NAMES[tab] }).click();
	}

	/** Usernames on the side's roster of the current set, from the rosters tab. */
	async rosterUsernames(side: "Alpha" | "Bravo") {
		await this.openTab("rosters");
		const otherSide = side === "Alpha" ? "Bravo" : "Alpha";
		const column = this.page
			.getByRole("tabpanel")
			.locator("div")
			.filter({ has: this.page.getByRole("heading", { name: side }) })
			.filter({ hasNot: this.page.getByRole("heading", { name: otherSide }) })
			.first();

		return column.locator("li").allInnerTexts();
	}

	async signUp() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.signUpButton.click(),
		);
	}

	async checkIn() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.checkInButton.click(),
		);
	}

	/** Reports the viewer's own team as the winner of every map until the set is decided. */
	async reportOwnTeamSweep(mapsToWin: number) {
		for (let i = 0; i < mapsToWin; i++) {
			await this.page
				.locator('[data-testid^="winner-radio-"]')
				.filter({ hasText: "My team" })
				.click();
			if (i < mapsToWin - 1) {
				await waitForPOSTResponse(this.page, () =>
					this.locators.reportScoreButton.click(),
				);
				await expect(this.locators.selectedWinner).toHaveCount(0);
				continue;
			}

			await this.locators.reportScoreButton.click();
			await waitForPOSTResponse(this.page, () =>
				this.locators.confirmSetEndButton.click(),
			);
		}
	}

	async confirmSet() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.confirmSetButton.click(),
		);
	}

	async endLobby() {
		await this.locators.endLobbyButton.click();
		await waitForPOSTResponse(this.page, () =>
			this.page
				.getByRole("dialog")
				.getByRole("button", { name: "End lobby" })
				.click(),
		);
	}
}
