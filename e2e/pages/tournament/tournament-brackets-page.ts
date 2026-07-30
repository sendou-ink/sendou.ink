import type { Page } from "@playwright/test";
import { tournamentBracketsPage } from "~/utils/urls";
import {
	expect,
	modalClickConfirmButton,
	navigate,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { TournamentMatchPage } from "./tournament-match-page";
import { TournamentNav } from "./tournament-nav";

export class TournamentBracketsPage {
	private readonly page: Page;
	readonly nav;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.nav = new TournamentNav(page);
		this.locators = {
			bracketsViewer: page.getByTestId("brackets-viewer"),
			showResultsButton: page.getByRole("button", { name: "Show results" }),
			hideResultsButton: page.getByRole("button", { name: "Hide results" }),
			censoredTeamNames: page.getByText("???"),
			matches: page.locator("[data-match-id]"),
			rrStandingsTables: page.getByTestId("rr-standings-table"),
			liveBadges: page.getByTestId("brackets-viewer").getByText("LIVE"),
			castBadges: page.getByTestId("brackets-viewer").getByText("CAST"),
			streamPopover: page.getByTestId("stream-popover"),
			streamPopoverStreams: page.getByTestId("tournament-stream"),
			finalizeTournamentButton: page.getByTestId("finalize-tournament-button"),
			startRoundButton: page.getByTestId("start-round-button"),
			byeTeam: page.getByTestId("bye-team"),
			prepareMapsButton: page.getByTestId("prepare-maps-button"),
			preparedMapsCheckIcon: page.getByTestId("prepared-maps-check-icon"),
			waitingOnGroupText: page.getByText("Waiting on group to finish"),
		};
	}

	async goto(tournamentId: number, bracketIdx?: number) {
		await navigate({
			page: this.page,
			url: tournamentBracketsPage({ tournamentId, bracketIdx }),
		});
	}

	teamName(name: string) {
		return this.page.getByText(name);
	}

	/** The tab labels drop the "bracket" suffix of the bracket's name. */
	bracketTab(name: string) {
		return this.page.getByRole("tab", { name });
	}

	roundLabel(roundNumber: number) {
		return this.page.getByText(`Round ${roundNumber}`, { exact: true });
	}

	match(matchId: number) {
		return this.page.locator(`[data-match-id="${matchId}"]`);
	}

	/** The match's countdown timer, a sibling of the match link. */
	matchTimer(matchId: number) {
		return this.match(matchId).locator("..").getByTestId("bracket-match-timer");
	}

	participantInRound(roundId: number, tournamentTeamId: number) {
		return this.page.locator(
			`[data-round-id="${roundId}"] [data-participant-id="${tournamentTeamId}"]`,
		);
	}

	/** Starts the bracket, going through the map list dialog with its defaults. */
	async finalize() {
		await this.page.getByTestId("finalize-bracket-button").click();
		await submit(this.page, "confirm-finalize-bracket-button");
	}

	/** Opens the map list dialog of the finalize bracket button, for starting the
	 * bracket with non-default options. */
	async openFinalizeDialog() {
		await this.page.getByTestId("finalize-bracket-button").click();
		return new BracketMapListDialog(this.page);
	}

	/** The same map list dialog, opened for preparing maps ahead of the start. */
	async openPrepareMapsDialog() {
		await this.locators.prepareMapsButton.click();
		return new BracketMapListDialog(this.page);
	}

	async openFinalizeTournamentDialog() {
		await this.locators.finalizeTournamentButton.click();
		return new FinalizeTournamentDialog(this.page);
	}

	async openMatch(matchId: number) {
		await expect(async () => {
			await this.match(matchId).click();
			await expect(
				this.page.getByTestId("back-to-bracket-button"),
			).toBeVisible();
		}).toPass();
		return new TournamentMatchPage(this.page);
	}

	/** Copies the sub invite link of the own team and reads it off the clipboard. */
	async copySubInviteLink(): Promise<string> {
		await this.page.getByTestId("add-sub-button").click();
		await this.page.getByTestId("copy-invite-link-button").click();
		return this.page.evaluate("navigator.clipboard.readText()");
	}

	/** Checks the own team in to a bracket that requires a check-in. */
	checkInBracket() {
		return submit(this.page, "check-in-bracket-button");
	}

	async openGroup(letter: string) {
		await this.page.getByTestId(`group-${letter}-button`).click();
	}

	startRound() {
		return submit(this.page, "start-round-button");
	}

	async resetRound() {
		await this.page.getByTestId("reset-round-button").click();
		await modalClickConfirmButton(this.page);
	}
}

/** The map list dialog used both for starting a bracket and preparing its maps. */
class BracketMapListDialog {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			pickBanSelect: page.getByLabel("Pick/ban"),
			countTypeSelect: page.getByLabel("Count type", { exact: true }),
			expectedTeamsSelect: page.getByLabel("Expected teams"),
			increaseMapCountButtons: page.getByTestId("increase-map-count-button"),
			unlinkFinalsButton: page.getByTestId(
				"unlink-finals-3rd-place-match-button",
			),
			linkFinalsButton: page.getByTestId("link-finals-3rd-place-match-button"),
			beforeSetText: page.getByText("Before set"),
		};
	}

	async setPickBan(value: string) {
		await this.locators.pickBanSelect.selectOption(value);
	}

	async setCountType(value: string) {
		await this.locators.countTypeSelect.selectOption(value);
	}

	async setExpectedTeams(count: number) {
		await this.locators.expectedTeamsSelect.selectOption(String(count));
	}

	async increaseMapCount(position: "first" | "last") {
		await this.locators.increaseMapCountButtons[position]().click();
	}

	async unlinkFinalsThirdPlaceMatch() {
		await this.locators.unlinkFinalsButton.click();
	}

	confirm() {
		return submit(this.page, "confirm-finalize-bracket-button");
	}

	/** Starts the bracket with a CUSTOM pick/ban flow. The flow builder UI has no
	 * e2e-friendly handles, so the flow is written straight into the form's maps
	 * input before submitting it. */
	confirmWithCustomFlow(customFlow: unknown) {
		return waitForPOSTResponse(this.page, async () => {
			await this.page.evaluate((cfStr) => {
				const input = document.querySelector(
					'input[name="maps"]',
				) as HTMLInputElement;
				const maps = JSON.parse(input.value);
				const cf = JSON.parse(cfStr);
				for (const m of maps) {
					if (m.pickBan === "CUSTOM") {
						m.customFlow = cf;
					}
				}
				input.value = JSON.stringify(maps);

				const form = input.closest("form")!;
				const btn = document.createElement("button");
				btn.type = "submit";
				btn.name = "_action";
				btn.value = "START_BRACKET";
				btn.style.display = "none";
				form.appendChild(btn);
				btn.click();
			}, JSON.stringify(customFlow));
		});
	}
}

/** The dialog behind the finalize tournament button: badge assignment and confirm. */
class FinalizeTournamentDialog {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			assignBadgesLaterSwitch: page.getByTestId("assign-badges-later-switch"),
		};
	}

	async selectBadgeReceiver(nth: number, tournamentTeamId: number) {
		await this.page
			.getByLabel("Receiving team")
			.nth(nth)
			.selectOption(String(tournamentTeamId));
	}

	async assignBadgesLater() {
		await this.locators.assignBadgesLaterSwitch.click();
	}

	confirm() {
		return modalClickConfirmButton(this.page);
	}
}
