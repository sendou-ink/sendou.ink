import type { Page } from "@playwright/test";
import { lobbyPage } from "~/utils/urls";
import {
	expect,
	modalClickConfirmButton,
	navigate,
	selectWeapon,
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
			friendCodeNeededText: page.getByText("Set your friend code to sign up"),
			readyCheck: page.getByTestId("lobby-ready-check"),
			confirmReadyButton: page.getByTestId("lobby-confirm-ready-button"),
			participants: page.getByTestId("lobby-participant"),
			winnerRadios: page.locator('[data-testid^="winner-radio-"]'),
			reportScoreButton: page.getByTestId("report-score-button"),
			confirmSetEndButton: page.getByTestId("confirm-set-end-button"),
			confirmSetButton: page.getByTestId("lobby-confirm-set-button"),
			disputeButton: page.getByRole("button", { name: "Score is wrong" }),
			undoReportButton: page.getByRole("button", { name: "Undo report" }),
			reportWeaponsButton: page.getByTestId("expand-secondary-action-button"),
			// the weapon reporter's own submit, which has no test id of its own
			submitWeaponButton: page
				.getByRole("button", { name: "Submit", exact: true })
				.last(),
			settingsButton: page.getByTestId("lobby-settings-button"),
			copyShareLinkButton: page.getByTestId("lobby-copy-share-link-button"),
			disputedText: page.getByText("The result was disputed"),
			leaderboardRows: page.getByTestId("lobby-leaderboard-row"),
			endLobbyButton: page.getByTestId("lobby-end-button"),
			endedStatus: page.getByText("· Ended"),
			forfeitNote: page.getByTestId("lobby-forfeit-note"),
			waitingBanner: page.getByTestId("lobby-waiting-banner"),
			leavingAfterSetMarkers: page.getByRole("button", {
				name: "Leaving after this set",
			}),
			leavingAfterSetPopover: page.getByTestId("roster-leaving-popover"),
			leftLobbyMarkers: page.getByRole("button", { name: "Left the lobby" }),
			leftLobbyPopover: page.getByTestId("lobby-left-popover"),
			// scoped to the page, the chat's split view has tab panels of its own
			tabPanel: page.getByRole("main").getByRole("tabpanel"),
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

	/** Share links carry the production domain; only their path is navigated to. */
	async gotoViaShareLink(shareLink: string) {
		const url = new URL(shareLink);
		await navigate({ page: this.page, url: url.pathname + url.search });
	}

	/** Copies the link a link-only lobby is found with and reads it off the clipboard. */
	async copyShareLink(): Promise<string> {
		await this.locators.copyShareLinkButton.click();
		return this.page.evaluate("navigator.clipboard.readText()");
	}

	/** The page heading with the lobby's name. */
	heading(name: string) {
		return this.page.getByRole("heading", { name, exact: true });
	}

	/** The match page tab, shown only once there is something on it. */
	tab(tab: Tab) {
		return this.page.getByRole("tab", { name: TAB_NAMES[tab] });
	}

	/** The banner's "Best of" of the set being played. */
	bestOf(count: number) {
		return this.page.getByText(`Best of ${count}`, { exact: true });
	}

	/** The mark on the player's row of the Rosters tab, shown while they are leaving once the set is confirmed. */
	leavingAfterSetMarker(username: string) {
		return this.locators.tabPanel
			.getByRole("listitem")
			.filter({ hasText: username })
			.getByRole("button", { name: "Leaving after this set" });
	}

	/** A weapon's image, e.g. on the Result timeline or a Rankings row. */
	weaponImage(name: string) {
		return this.page.getByRole("img", { name }).first();
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

	/** Confirms being ready to take a spot that opened up in the room. */
	async confirmReady() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.confirmReadyButton.click(),
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
		for (let i = 0; i < mapsToWin - 1; i++) {
			await this.reportOwnTeamWin();
		}

		await this.locators.winnerRadios.filter({ hasText: "My team" }).click();
		await this.locators.reportScoreButton.click();
		await waitForPOSTResponse(this.page, () =>
			this.locators.confirmSetEndButton.click(),
		);
	}

	/** Reports the viewer's own team as the winner of the current map, one that doesn't decide the set. */
	async reportOwnTeamWin() {
		await this.locators.winnerRadios.filter({ hasText: "My team" }).click();
		await waitForPOSTResponse(this.page, () =>
			this.locators.reportScoreButton.click(),
		);
		await expect(this.locators.selectedWinner).toHaveCount(0);
	}

	/** The player's row on the Rankings tab. */
	rankingsRow(username: string) {
		return this.locators.leaderboardRows.filter({ hasText: username });
	}

	/** The mark on the host's Rankings row. */
	hostMarker(username: string) {
		return this.rankingsRow(username).getByRole("button", {
			name: "Host",
			exact: true,
		});
	}

	/** The mark on a Rankings row of a player no longer in the lobby. */
	leftLobbyMarker(username: string) {
		return this.rankingsRow(username).getByRole("button", {
			name: "Left the lobby",
		});
	}

	/** Reports the weapon the viewer plays on the current map. */
	async reportWeapon(name: string) {
		// already expanded when the viewer's preference says so, a click would collapse it
		if (await this.locators.reportWeaponsButton.isVisible()) {
			await waitForPOSTResponse(this.page, () =>
				this.locators.reportWeaponsButton.click(),
			);
		}
		await selectWeapon({ page: this.page, name });
		await waitForPOSTResponse(this.page, () =>
			this.locators.submitWeaponButton.click(),
		);
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
		await this.openPlayerMenu(userId);
		await this.page.getByRole("menuitem", { name: "Remove" }).click();
		await modalClickConfirmButton(this.page);
	}

	/** As the host, hands hosting over to the participant through their player menu, confirming it. */
	async makeHost(userId: number) {
		await this.openPlayerMenu(userId);
		await this.page.getByRole("menuitem", { name: "Make host" }).click();
		await modalClickConfirmButton(this.page);
	}

	/** As the host, keeps a player of the room out of the sets until resumed, through their player menu on the Rankings tab. */
	async sitOut(userId: number) {
		await this.openPlayerMenu(userId);
		await waitForPOSTResponse(this.page, () =>
			this.page.getByRole("menuitem", { name: "Sit out" }).click(),
		);
	}

	/** As the host, lets a player sitting out play again, through their player menu on the Rankings tab. */
	async resume(userId: number) {
		await this.openPlayerMenu(userId);
		await waitForPOSTResponse(this.page, () =>
			this.page.getByRole("menuitem", { name: "Resume" }).click(),
		);
	}

	/** As the host, changes how many maps the sets are a best of, from the next set on. */
	async changeBestOf(count: number) {
		await this.locators.settingsButton.click();
		await waitForPOSTResponse(this.page, () =>
			this.page
				.getByRole("dialog")
				.getByText(`Bo${count}`, { exact: true })
				.click(),
		);
	}

	/** As the host, ends the lobby for everyone. */
	async endLobby() {
		await this.locators.endLobbyButton.click();
		await modalClickConfirmButton(this.page);
	}

	private async openPlayerMenu(userId: number) {
		await this.page.getByTestId(`lobby-player-menu-${userId}`).click();
	}
}
