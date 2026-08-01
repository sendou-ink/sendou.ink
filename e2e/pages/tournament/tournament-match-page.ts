import type { Page } from "@playwright/test";
import { tournamentMatchPage } from "~/utils/urls";
import {
	expect,
	navigate,
	selectWeapon,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { TournamentBracketsPage } from "./tournament-brackets-page";
import { TournamentNav } from "./tournament-nav";

type Side = 1 | 2;
type RosterSide = "alpha" | "bravo";
type Tab = "action" | "admin" | "result" | "rosters";

const TAB_LABELS: Record<Tab, string> = {
	action: "Action",
	admin: "Admin",
	result: "Result",
	rosters: "Rosters",
};

/** `/to/:id/matches/:mid`. The match page splits its UI into URL-driven tabs
 * (rosters/action/admin/etc.) — `openTab` handles the navigation between them. */
export class TournamentMatchPage {
	private readonly page: Page;
	readonly nav;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.nav = new TournamentNav(page);
		this.locators = {
			roomPass: page.getByTestId("room-pass"),
			backToBracketButton: page.getByTestId("back-to-bracket-button"),
			activeRosterNeededText: page.getByTestId("active-roster-needed-text"),
			reopenMatchButton: page.getByTestId("reopen-match-button"),
			adminTab: page.getByRole("tab", { name: TAB_LABELS.admin }),
			stageBanner: page.getByTestId("stage-banner"),
			finalBanner: page.getByTestId("match-final"),
			matchTimer: page.getByTestId("match-timer"),
			screenBanned: page.getByTestId("screen-banned"),
			screenAllowed: page.getByTestId("screen-allowed"),
			unlockButton: page.getByRole("button", { name: "Unlock" }),
			poolLabel: page.getByText("Pool", { exact: true }),
			koCheckbox: page.getByLabel("KO"),
			koResultText: page.getByText(/\(KO\)/).first(),
			selectWinnerText: page.getByText("Select the winner"),
			counterpickText: page.getByText("Counterpick", { exact: true }),
			banAMapText: page.getByText(/Ban a map/),
			lastBanText: page.getByText(/Ban a map \(2\/2\)/),
			pickAMapText: page.getByText(/Pick a map/),
			actionPanel: page.getByRole("tabpanel", { name: TAB_LABELS.action }),
			rostersPanel: page.getByRole("tabpanel", { name: TAB_LABELS.rosters }),
			reportWeaponsButton: page.getByRole("button", {
				name: "Report used weapons",
			}),
			// the weapon reporter's own submit, which has no test id of its own
			submitWeaponButton: page
				.getByRole("button", { name: "Submit", exact: true })
				.last(),
			undoWeaponButton: page.getByRole("button", { name: "Undo weapon" }),
		};
	}

	async goto({
		tournamentId,
		matchId,
	}: {
		tournamentId: number;
		matchId: number;
	}) {
		await navigate({
			page: this.page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});
	}

	async openTab(tab: Tab) {
		// When teams have more members than the minimum, the action tab is hidden
		// until each team's active roster is locked in via the rosters tab. Auto-set
		// any roster that's still in default-editing mode so callers can stay focused
		// on the flow they actually care about.
		if (tab === "action") {
			await this.ensureActiveRostersSet();
		}
		await this.page.getByRole("tab", { name: TAB_LABELS[tab] }).click();
	}

	score(score: [number, number]) {
		return this.page.getByText(score.join("-")).first();
	}

	winnerRadio(side: Side) {
		return this.page.getByTestId(`winner-radio-${side}`);
	}

	modeProgress(mode: string) {
		return this.page.getByTestId(`mode-progress-${mode}`);
	}

	mapCountText(count: number) {
		return this.page.getByText(`×${count}`);
	}

	playAllText(count: number) {
		return this.page.getByText(`Play all ${count}`);
	}

	/**
	 * Sweeps `mapsToReport` maps in a row, all won by `winner`. By default the
	 * last map ends the set (the typical case — full Bo3/Bo5 sweep), and the
	 * flow goes through the confirmation screen for that map. Pass
	 * `setEnds: false` when reporting a partial set (e.g. only 1 of a Bo3).
	 */
	async reportResult({
		mapsToReport,
		winner = 1,
		setEnds = true,
	}: {
		mapsToReport: number;
		winner?: Side;
		setEnds?: boolean;
	}) {
		for (let i = 0; i < mapsToReport; i++) {
			const isFinal = setEnds && i === mapsToReport - 1;
			// Wait for the action panel to settle before clicking. waitForPOSTResponse
			// only waits for the POST itself; the loader revalidation that swaps in
			// the next map's component runs after, so a previous winner can still be
			// `data-selected="true"` here. Clicking too early hits the about-to-unmount
			// label and the selection is lost on remount.
			await expect(
				this.page.locator(
					'[data-testid^="winner-radio-"][data-selected="true"]',
				),
			).toHaveCount(0);
			await this.winnerRadio(winner).click();
			if (isFinal) {
				await this.page.getByTestId("report-score-button").click();
				await submit(this.page, "confirm-set-end-button");
			} else {
				await submit(this.page, "report-score-button");
			}
		}
	}

	/**
	 * Selects one of the pick/ban options and submits it.
	 *
	 * Selecting and submitting are retried together as one unit: a re-render
	 * landing mid-click can swallow the submit press (see waitForPOSTResponse)
	 * and, if the panel remounted, the selection with it — so re-submitting
	 * alone would not be enough.
	 */
	pickBan(option: "first" | "last" = "first") {
		return waitForPOSTResponse(this.page, async () => {
			await this.page.getByTestId("pick-ban-button")[option]().click();
			await this.page.getByTestId("pick-ban-submit-button").click();
		});
	}

	undoLastReport() {
		return waitForPOSTResponse(this.page, async () => {
			await this.page.getByTestId("undo-score-button").click();
		});
	}

	/** The weapon reporter's input for the `mapNumber`th map of the set (1-indexed). */
	weaponPrompt(mapNumber: number) {
		return this.page.getByText(`Your weapon #${mapNumber}`);
	}

	/** The weapon reporter sits collapsed behind a button unless the viewer's
	 * preference has it open — expanding an already open one is a no-op. */
	async expandWeaponReporter() {
		await expect(this.locators.actionPanel).toBeVisible();
		if (await this.locators.reportWeaponsButton.isVisible()) {
			await this.locators.reportWeaponsButton.click();
		}
	}

	async reportWeapon(name: string) {
		await this.expandWeaponReporter();
		await selectWeapon({ page: this.page, name });
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.submitWeaponButton.click();
		});
	}

	playerCheckbox(side: RosterSide, nth: number) {
		return this.page.getByTestId(`player-checkbox-${side}-${nth}`);
	}

	saveActiveRoster(side: RosterSide) {
		return submit(this.page, `save-active-roster-button-${side}`);
	}

	editActiveRosterButton(side: RosterSide) {
		return this.page.getByTestId(`edit-active-roster-button-${side}`);
	}

	/** Puts exactly the members at `memberIndexes` on the team's active roster,
	 * from the rosters tab. Starts an edit first when a roster was already set. */
	async setActiveRoster(side: RosterSide, memberIndexes: number[]) {
		await expect(this.locators.rostersPanel).toBeVisible();

		const editButton = this.editActiveRosterButton(side);
		const checkboxes = this.page.locator(
			`[data-testid^="player-checkbox-${side}-"]`,
		);
		// A roster that was never set renders in editing mode already, one that was
		// has to be put back into it.
		await expect(editButton.or(checkboxes.first())).toBeVisible();
		if (await editButton.isVisible()) {
			await editButton.click();
			await expect(checkboxes.first()).toBeVisible();
		}

		const memberCount = await checkboxes.count();
		for (let i = 0; i < memberCount; i++) {
			const checkbox = this.playerCheckbox(side, i);
			if ((await checkbox.isChecked()) !== memberIndexes.includes(i)) {
				await checkbox.click();
			}
		}

		await this.saveActiveRoster(side);
	}

	reopen() {
		return submit(this.page, "reopen-match-button");
	}

	editResultButton(nth: number) {
		return this.page.getByTestId(`edit-result-${nth}-button`);
	}

	editResultPlayerCheckbox(side: RosterSide, nth: number) {
		return this.page.getByTestId(`edit-result-player-checkbox-${side}-${nth}`);
	}

	saveResult(nth: number) {
		return submit(this.page, `save-result-${nth}-button`);
	}

	/** Assigns a cast Twitch account to the match via the admin tab's chip radio,
	 * which auto-submits the cast channel on pick. */
	setCastedBy(twitchAccount: string) {
		return waitForPOSTResponse(this.page, async () => {
			await this.page.locator(`label[for$="-${twitchAccount}"]`).click();
		});
	}

	/** Toggles the match's lock state via the admin tab's cast info form. */
	submitCastInfo() {
		return submit(this.page, "cast-info-submit-button");
	}

	async endSetWithRandomWinner() {
		await this.page.getByRole("button", { name: "End set" }).click();
		await this.page.getByRole("radio", { name: /Random/ }).check();
		await submit(this.page, "end-set-button");
	}

	async backToBracket() {
		await expect(async () => {
			await this.locators.backToBracketButton.click();
			await expect(this.page.getByTestId("brackets-viewer")).toBeVisible();
		}).toPass();
		return new TournamentBracketsPage(this.page);
	}

	private async ensureActiveRostersSet() {
		const sides: RosterSide[] = ["alpha", "bravo"];

		// If the action tab is already there, no rosters need setting.
		if (
			(await this.page.getByRole("tab", { name: TAB_LABELS.action }).count()) >
			0
		) {
			return;
		}

		// Editing inputs only render on the rosters tab — switch there.
		await this.page.getByRole("tab", { name: TAB_LABELS.rosters }).click();
		// Wait for the rosters panel to be ready before probing for editing UI.
		await expect(this.locators.rostersPanel).toBeVisible();

		for (const side of sides) {
			const submitButton = this.page.getByTestId(
				`save-active-roster-button-${side}`,
			);
			if ((await submitButton.count()) === 0) continue;

			// Default-editing renders all members unchecked; pick the first 4.
			for (let i = 0; i < 4; i++) {
				const checkbox = this.playerCheckbox(side, i);
				if (!(await checkbox.isChecked())) await checkbox.click();
			}
			await this.saveActiveRoster(side);
		}
	}
}
