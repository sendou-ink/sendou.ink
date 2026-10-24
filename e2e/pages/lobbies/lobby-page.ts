import type { Page } from "@playwright/test";
import { lobbyPage } from "~/utils/urls";
import {
	expect,
	modalClickConfirmButton,
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
			dropAfterSetButton: page.getByTestId("lobby-drop-after-set-button"),
			viewerStatus: page.getByTestId("lobby-viewer-status"),
			participants: page.getByTestId("lobby-participant"),
			winnerRadios: page.locator('[data-testid^="winner-radio-"]'),
			reportScoreButton: page.getByTestId("report-score-button"),
			confirmSetEndButton: page.getByTestId("confirm-set-end-button"),
			confirmSetButton: page.getByTestId("lobby-confirm-set-button"),
			disputeButton: page.getByRole("button", { name: "Score is wrong" }),
			undoReportButton: page.getByRole("button", { name: "Undo report" }),
			disputedText: page.getByText("The result was disputed"),
			leaderboardRows: page.getByTestId("lobby-leaderboard-row"),
			endLobbyButton: page.getByTestId("lobby-end-button"),
			endedStatus: page.getByText("· Ended"),
			waitingBanner: page.getByTestId("lobby-waiting-banner"),
			tabPanel: page.getByRole("tabpanel"),
			selectedWinner: page.locator(
				'[data-testid^="winner-radio-"][data-selected="true"]',
			),
		};
	}

	/** Opens the lobby's page, on the given tab when one is passed. */
	async goto(lobbyId: number, tab?: Tab) {
		await navigate({
			page: this.page,
			url: tab ? `${lobbyPage(lobbyId)}?tab=${tab}` : lobbyPage(lobbyId),
		});
	}

	/** The page heading with the lobby's name. */
	heading(name: string) {
		return this.page.getByRole("heading", { name, exact: true });
	}

	/** Switches to one of the match page tabs. */
	async openTab(tab: Tab) {
		await this.page.getByRole("tab", { name: TAB_NAMES[tab] }).click();
	}

	/** Usernames on the side's roster of the current set, from the rosters tab. */
	async rosterUsernames(side: "Alpha" | "Bravo") {
		await this.openTab("rosters");
		const otherSide = side === "Alpha" ? "Bravo" : "Alpha";
		const column = this.locators.tabPanel
			.locator("div")
			.filter({ has: this.page.getByRole("heading", { name: side }) })
			.filter({ hasNot: this.page.getByRole("heading", { name: otherSide }) })
			.first();

		return column.locator("li").allInnerTexts();
	}

	/** Signs the viewer up: a spot, the waitlist or, once the lobby has started, checked in right away. */
	async signUp() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.signUpButton.click(),
		);
	}

	/** Checks the viewer in, confirming they are there to play. */
	async checkIn() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.checkInButton.click(),
		);
	}

	/** Leaves the lobby through the confirmation dialog. */
	async leave() {
		await this.locators.leaveButton.click();
		await modalClickConfirmButton(this.page);
	}

	/** Asks to leave once the set being played is confirmed. */
	async dropAfterSet() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.dropAfterSetButton.click(),
		);
	}

	/** Reports the viewer's own team as the winner of every map until the set is decided. */
	async reportOwnTeamSweep(mapsToWin: number) {
		for (let i = 0; i < mapsToWin; i++) {
			await this.locators.winnerRadios.filter({ hasText: "My team" }).click();
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

	/** Confirms the result the other side reported. */
	async confirmSet() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.confirmSetButton.click(),
		);
	}

	/** Says the result the other side reported is wrong. */
	async disputeResult() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.disputeButton.click(),
		);
	}

	/** Undoes the latest map report. */
	async undoReport() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.undoReportButton.click(),
		);
	}

	/** As the host, removes the participant from the lobby through their player menu. */
	async removeParticipant(userId: number) {
		await this.page.getByTestId(`lobby-player-menu-${userId}`).click();
		await this.page.getByRole("menuitem", { name: "Remove" }).click();
		await modalClickConfirmButton(this.page);
	}

	/** As the host, ends the lobby for everyone. */
	async endLobby() {
		await this.locators.endLobbyButton.click();
		await modalClickConfirmButton(this.page);
	}
}
