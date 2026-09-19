import type { Page } from "@playwright/test";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import { sendouQMatchPage } from "~/utils/urls";
import {
	expect,
	navigate,
	selectWeapon,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { UserCard } from "../user/user-card";

type Side = "ALPHA" | "BRAVO";

/** One team's account of the cancellation, as the cancel dialog collects it. */
type CancelReport = {
	reason: string;
	/** Id of the player to nominate as a cause. */
	nominateUserId?: number;
};
type Tab = "action" | "result" | "rosters";

const MAPS_TO_WIN = Math.ceil(SENDOUQ_BEST_OF / 2);

const TEAM_NAMES: Record<Side, string> = {
	ALPHA: "Group Alpha",
	BRAVO: "Group Bravo",
};

export class SendouQMatchPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			reportScoreButton: page.getByTestId("report-score-button"),
			confirmSetEndButton: page.getByTestId("confirm-set-end-button"),
			// the weapon reporter's own submit, which has no test id of its own
			submitWeaponButton: page
				.getByRole("button", { name: "Submit", exact: true })
				.last(),
			undoReportButton: page.getByRole("button", { name: "Undo report" }),
			reportWeaponsButton: page.getByTestId("expand-secondary-action-button"),
			undoWeaponButton: page.getByRole("button", { name: "Undo weapon" }),
			confirmScoreButton: page.getByTestId("confirm-score-button"),
			requestCancelButton: page.getByRole("button", { name: "Request cancel" }),
			cancelPendingText: page.getByText("Pending other team's confirmation"),
			cancelPrompt: page.getByText("Accept canceling the set?"),
			canceledText: page.getByText("Match canceled"),
			lookAgainButton: page.getByRole("button", {
				name: "Look again with same group",
			}),
			rejoinQueueButton: page.getByRole("button", { name: "Rejoin queue" }),
			backToQueueButton: page.getByRole("button", { name: "Back to queue" }),
			declinedText: page.getByText("You are not continuing with this group"),
			votedYes: page.getByLabel("voted yes"),
			votedNo: page.getByLabel("voted no"),
			pendingVotes: page.getByLabel("pending"),
			selectedWinner: page.locator(
				'[data-testid^="winner-radio-"][data-selected="true"]',
			),
		};
	}

	async goto(matchId: number, tab: Tab = "action") {
		await navigate({
			page: this.page,
			url: `${sendouQMatchPage(matchId)}?tab=${tab}`,
		});
	}

	score(alpha: number, bravo: number) {
		return this.page.getByText(new RegExp(`${alpha}\\s*-\\s*${bravo}`)).first();
	}

	/** The banner of the map being played, when it is one of `maps`. */
	currentMap(maps: ModeWithStage[]) {
		const alternatives = maps.map((map) => `${map.mode}-${map.stageId}`);
		return this.page.getByTestId(
			new RegExp(`^banner-map-(${alternatives.join("|")})$`),
		);
	}

	/** The badge of a mode played in the set, one per map unless every map shares the mode. */
	modeProgress(mode: ModeWithStage["mode"]) {
		return this.page.getByTestId(`mode-progress-${mode}`);
	}

	/** How many maps the one shown mode is played on, shown only when every map shares it. */
	mapCountText(count: number) {
		return this.page.getByText(`\u00d7${count}`);
	}

	reportedWeaponImage(name: string) {
		return this.page.getByRole("img", { name }).first();
	}

	openUserCard(name: string | RegExp) {
		return UserCard.open(
			this.page,
			this.page.getByRole("button", { name }).first(),
		);
	}

	/** Reports the winner of every map of the set, `winner` winning all of them. */
	async reportSweep(winner: Side) {
		for (let i = 0; i < MAPS_TO_WIN - 1; i++) {
			await this.reportMapWinner(winner);
		}
		await this.reportSetEndingMap(winner);
	}

	async reportMapWinner(winner: Side) {
		await this.selectMapWinner(winner);
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.reportScoreButton.click();
		});
		// waitForPOSTResponse doesn't cover the loader revalidation, which remounts
		// MatchActionTab (keyed on reportedCount) and the nested WeaponReporter; a
		// follow-up click landing on the about-to-unmount instance loses its local state
		await expect(this.locators.selectedWinner).toHaveCount(0);
	}

	/** Reports the map that wins the set for `winner`, through its confirmation screen. */
	async reportSetEndingMap(winner: Side) {
		await this.selectMapWinner(winner);
		await this.locators.reportScoreButton.click();
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.confirmSetEndButton.click();
		});
	}

	async undoReport() {
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.undoReportButton.click();
		});
	}

	async reportWeapon(name: string) {
		// The reporter is already expanded when the viewer's preference says so,
		// and clicking then would collapse it instead.
		if (await this.locators.reportWeaponsButton.isVisible()) {
			await waitForPOSTResponse(this.page, async () => {
				await this.locators.reportWeaponsButton.click();
			});
		}
		await selectWeapon({ page: this.page, name });
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.submitWeaponButton.click();
		});
	}

	async confirmScore() {
		await expect(this.locators.confirmScoreButton).toBeEnabled({
			timeout: 10_000,
		});
		await this.locators.confirmScoreButton.click();

		const armedLossButton = this.locators.confirmScoreButton.filter({
			hasText: "Tap again",
		});

		await waitForPOSTResponse(this.page, async () => {
			if (await armedLossButton.isVisible()) {
				await armedLossButton.click();
			}
		});
	}

	async requestCancel(report: CancelReport) {
		await this.locators.requestCancelButton.click();
		await this.submitCancelDialog(report);
	}

	async refuseCancel() {
		await waitForPOSTResponse(this.page, async () => {
			await this.page.getByRole("button", { name: "Refuse" }).click();
		});
	}

	async acceptCancel(report: CancelReport) {
		await this.page.getByRole("button", { name: "Accept" }).click();
		await this.submitCancelDialog(report);
	}

	/** Nominates a player, the first listed one unless named, and submits the cancel dialog. */
	private async submitCancelDialog({ reason, nominateUserId }: CancelReport) {
		const dialog = this.page.getByRole("dialog");
		// each nomination checkbox carries its player's id as its value
		await (nominateUserId
			? dialog.locator(`input[type="checkbox"][value="${nominateUserId}"]`)
			: dialog.getByRole("checkbox").first()
		).check();
		await dialog.getByLabel("Reason").fill(reason);
		await waitForPOSTResponse(this.page, async () => {
			await dialog.getByTestId("cancel-match-submit").click();
		});
	}

	async voteYes() {
		await waitForPOSTResponse(this.page, async () => {
			await this.page.getByRole("button", { name: "Yes, continue" }).click();
		});
	}

	async voteNo() {
		await this.page.getByRole("button", { name: "No, I'm done" }).click();
		await this.confirmDialog();
	}

	async lookAgain() {
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.lookAgainButton.click();
		});
	}

	async rejoinQueue() {
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.rejoinQueueButton.click();
		});
	}

	private async selectMapWinner(winner: Side) {
		const teamName = TEAM_NAMES[winner];
		// the loader revalidation swapping in the next map runs after the POST, so a
		// previous winner can still be selected; clicking the about-to-unmount label
		// loses the selection on remount
		await expect(this.locators.selectedWinner).toHaveCount(0);
		// the radio's testId sits on the label wrapping its visually hidden input
		const radio = this.page.locator(
			`[data-testid^="winner-radio-"]:has(input[aria-label="${teamName}"])`,
		);
		await radio.click();
		await expect(radio).toHaveAttribute("data-selected", "true");
	}

	private async confirmDialog() {
		await waitForPOSTResponse(this.page, async () => {
			await this.page.getByTestId("confirm-button").click();
		});
	}
}
