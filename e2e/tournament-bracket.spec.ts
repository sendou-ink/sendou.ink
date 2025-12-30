import { expect, type Page, test } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";
import {
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectUser,
	startBracket,
	submit,
} from "~/utils/playwright";
import {
	NOTIFICATIONS_URL,
	SETTINGS_PAGE,
	tournamentAdminPage,
	tournamentBracketsPage,
	tournamentMatchPage,
	tournamentPage,
	userResultsPage,
} from "~/utils/urls";

const navigateToMatch = async (page: Page, matchId: number) => {
	await expect(async () => {
		await page.locator(`[data-match-id="${matchId}"]`).click();
		await expect(page.getByTestId("match-header")).toBeVisible();
	}).toPass();
};

const reportResult = async ({
	page,
	amountOfMapsToReport,
	sidesWithMoreThanFourPlayers = ["last"],
	winner = 1,
	points,
}: {
	page: Page;
	amountOfMapsToReport: 1 | 2 | 3 | 4;
	sidesWithMoreThanFourPlayers?: ("first" | "last")[];
	winner?: 1 | 2;
	points?: [number, number];
}) => {
	const confirmCheckbox = page.getByTestId("end-confirmation");

	const fillPointsInput = async () => {
		if (!points) return;
		await page.getByTestId("points-input-1").fill(String(points[0]));
		await page.getByTestId("points-input-2").fill(String(points[1]));
	};

	await page.getByTestId("actions-tab").click();

	if (
		sidesWithMoreThanFourPlayers.includes("first") &&
		!(await page.getByTestId("player-checkbox-0").first().isDisabled())
	) {
		await page.getByTestId("player-checkbox-0").first().click();
		await page.getByTestId("player-checkbox-1").first().click();
		await page.getByTestId("player-checkbox-2").first().click();
		await page.getByTestId("player-checkbox-3").first().click();

		await submit(page, "save-active-roster-button-0");

		// update went through
		await expect(page.getByTestId("player-checkbox-0").first()).toBeDisabled();
	}
	if (
		sidesWithMoreThanFourPlayers.includes("last") &&
		!(await page.getByTestId("player-checkbox-0").last().isDisabled())
	) {
		await page.getByTestId("player-checkbox-0").last().click();
		await page.getByTestId("player-checkbox-1").last().click();
		await page.getByTestId("player-checkbox-2").last().click();
		await page.getByTestId("player-checkbox-3").last().click();

		await submit(page, "save-active-roster-button-1");
	}

	await fillPointsInput();

	await page.getByTestId(`winner-radio-${winner}`).click();
	await submit(page, "report-score-button");
	await expect(page.getByText(winner === 1 ? "1-0" : "0-1")).toBeVisible();

	if (amountOfMapsToReport >= 2) {
		await page.getByTestId(`winner-radio-${winner}`).click();
		await fillPointsInput();

		if (amountOfMapsToReport === 2) {
			await confirmCheckbox.click();
			await submit(page, "report-score-button");
			await expect(page.getByTestId("report-timestamp")).toBeVisible();
		} else {
			await submit(page, "report-score-button");
		}
	}

	if (amountOfMapsToReport === 3) {
		await expect(page.getByText("2-0")).toBeVisible();

		await page.getByTestId(`winner-radio-${winner}`).click();
		await fillPointsInput();

		await confirmCheckbox.click();
		await submit(page, "report-score-button");

		await expect(page.getByTestId("report-timestamp")).toBeVisible();
	}

	if (amountOfMapsToReport === 4) {
		await expect(page.getByText("2-0")).toBeVisible();

		await page.getByTestId(`winner-radio-${winner}`).click();
		await fillPointsInput();
		await submit(page, "report-score-button");

		await expect(page.getByText("3-0")).toBeVisible();

		await page.getByTestId(`winner-radio-${winner}`).click();

		await confirmCheckbox.click();
		await submit(page, "report-score-button");

		await expect(page.getByTestId("report-timestamp")).toBeVisible();
	}
};

const backToBracket = async (page: Page) => {
	await page.getByTestId("back-to-bracket-button").click();
	await expect(page.getByTestId("brackets-viewer")).toBeVisible();
};

const expectScore = (page: Page, score: [number, number]) =>
	expect(page.getByText(score.join("-"))).toBeVisible();

test.describe("Tournament bracket", () => {
	test("sets active roster as regular member", async ({ page }) => {
		const tournamentId = 1;
		const matchId = 2;
		await startBracket(page, tournamentId);

		await impersonate(page, 37);
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});
		await expect(page.getByTestId("active-roster-needed-text")).toBeVisible();

		await page.getByTestId("actions-tab").click();

		await page.getByTestId("player-checkbox-0").last().click();
		await page.getByTestId("player-checkbox-1").last().click();
		await page.getByTestId("player-checkbox-2").last().click();
		await page.getByTestId("player-checkbox-3").last().click();

		await submit(page, "save-active-roster-button-1");

		// did it persist?
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});
		await isNotVisible(page.getByTestId("active-roster-needed-text"));

		await page.getByTestId("actions-tab").click();
		await page.getByTestId("edit-active-roster-button").click();
		await page.getByTestId("player-checkbox-3").last().click();
		await page.getByTestId("player-checkbox-4").last().click();
		await submit(page, "save-active-roster-button-1");

		await expect(page.getByTestId("edit-active-roster-button")).toBeVisible();
		await expect(
			page.getByTestId("player-checkbox-3").last(),
		).not.toBeChecked();
	});

	// 1) Report winner of N-ZAP's first match
	// 2) Report winner of the adjacent match by using admin powers
	// 3) Report one match on the only losers side match available
	// 4) Try to reopen N-ZAP's first match and fail
	// 5) Undo score of first losers match
	// 6) Try to reopen N-ZAP's first match and succeed
	// 7) As N-ZAP, undo all scores and switch to different team sweeping
	test("reports score and sees bracket update", async ({ page }) => {
		const tournamentId = 2;
		await startBracket(page);

		await impersonate(page);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		// 1)
		await navigateToMatch(page, 5);
		await reportResult({ page, amountOfMapsToReport: 2 });
		await backToBracket(page);

		// 2)
		await impersonate(page);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await navigateToMatch(page, 6);
		await reportResult({ page, amountOfMapsToReport: 2 });
		await backToBracket(page);

		// 3)
		await navigateToMatch(page, 18);
		await reportResult({
			page,
			amountOfMapsToReport: 1,
			sidesWithMoreThanFourPlayers: ["first", "last"],
		});
		await backToBracket(page);

		// 4)
		await navigateToMatch(page, 5);
		await isNotVisible(page.getByTestId("reopen-match-button"));
		await backToBracket(page);

		// 5)
		await navigateToMatch(page, 18);
		await submit(page, "undo-score-button");
		await expectScore(page, [0, 0]);
		await backToBracket(page);

		// 6)
		await navigateToMatch(page, 5);
		await submit(page, "reopen-match-button");
		await expectScore(page, [1, 0]);

		// 7)
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await navigateToMatch(page, 5);
		await submit(page, "undo-score-button");
		await expectScore(page, [0, 0]);
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["last"],
			winner: 2,
		});
		await backToBracket(page);
		await expect(
			page.locator("[data-round-id='5'] [data-participant-id='102']"),
		).toBeVisible();
	});

	test("adds a sub mid tournament (from non checked in team)", async ({
		page,
	}) => {
		const tournamentId = 1;
		await startBracket(page, tournamentId);

		// captain of the first team
		await impersonate(page, 5);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("add-sub-button").click();
		await page.getByTestId("copy-invite-link-button").click();

		const inviteLinkProd: string = await page.evaluate(
			"navigator.clipboard.readText()",
		);
		const inviteLink = inviteLinkProd.replace(
			"https://sendou.ink",
			"http://localhost:6173",
		);

		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: inviteLink,
		});

		await submit(page);
		await expect(page).toHaveURL(/brackets/);
	});

	test("completes and finalizes a small tournament with badge assigning", async ({
		page,
	}) => {
		const tournamentId = 2;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentPage(tournamentId),
		});

		await page.getByTestId("admin-tab").click();

		await page.getByLabel("Action").selectOption("CHECK_OUT");

		for (let id = 103; id < 117; id++) {
			await page.getByLabel("Team", { exact: true }).selectOption(String(id));
			await submit(page);
		}

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await page.locator('[data-match-id="1"]').click();
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: [],
		});
		await backToBracket(page);

		await page.getByTestId("finalize-tournament-button").click();

		await page.getByLabel("Receiving team").first().selectOption("101");
		await page.getByLabel("Receiving team").last().selectOption("102");

		await submit(page, "confirm-button");

		await page.getByTestId("results-tab").click();
		// seed performance rating shows up after tournament is finalized
		await expect(page.getByTestId("spr-header")).toBeVisible();

		await navigate({
			page,
			url: userResultsPage({ discordId: ADMIN_DISCORD_ID }),
		});

		await expect(page.getByText("In The Zone 22")).toBeVisible();

		await navigate({
			page,
			url: NOTIFICATIONS_URL,
		});

		await expect(page.getByTestId("notification-item").first()).toContainText(
			"New badge",
		);
	});

	test("completes and finalizes a small tournament (RR->SE w/ underground bracket)", async ({
		page,
	}) => {
		test.slow();

		const tournamentId = 3;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentPage(tournamentId),
		});

		await page.getByTestId("admin-tab").click();

		await page.getByLabel("Action").selectOption("CHECK_OUT");

		for (let id = 202; id < 210; id++) {
			await page.getByLabel("Team", { exact: true }).selectOption(String(id));
			await submit(page);
		}

		await page.getByTestId("brackets-tab").click();
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		for (const id of [2, 4, 6, 7, 8, 9, 10, 11, 12]) {
			await navigateToMatch(page, id);
			await reportResult({
				page,
				amountOfMapsToReport: 2,
				sidesWithMoreThanFourPlayers: ["first", "last"],
				points: [100, 0],
			});
			await backToBracket(page);
		}

		// captain of one of the underground bracket teams
		await impersonate(page, 57);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByRole("button", { name: "Underground" }).click();
		await submit(page, "check-in-bracket-button");

		await impersonate(page);
		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		await page.getByLabel("Action").selectOption("CHECK_IN");
		await page.getByLabel("Team", { exact: true }).selectOption("216");
		await page
			.getByLabel("Bracket", { exact: true })
			.selectOption("Underground bracket");
		await submit(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId, bracketIdx: 2 }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 13);
		await reportResult({
			page,
			amountOfMapsToReport: 3,
			sidesWithMoreThanFourPlayers: ["first", "last"],
		});

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId, bracketIdx: 1 }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");
		for (const matchId of [14, 15, 16, 17]) {
			await navigateToMatch(page, matchId);
			await reportResult({
				page,
				amountOfMapsToReport: 3,
				sidesWithMoreThanFourPlayers: ["first", "last"],
			});

			await backToBracket(page);
		}
		await page.getByTestId("finalize-tournament-button").click();
		await page.getByTestId("assign-badges-later-switch").click();
		await submit(page, "confirm-button");

		// not possible to reopen finals match anymore
		await navigateToMatch(page, 14);
		await isNotVisible(page.getByTestId("reopen-match-button"));
		await backToBracket(page);

		// added result to user profile
		await page.getByTestId("results-tab").click();
		await page.getByTestId("result-team-name").first().click();
		await page.getByTestId("team-member-name").first().click();

		await page.getByTestId("user-seasons-tab").click();
		await expect(page.getByTestId("seasons-tournament-result")).toBeVisible();

		await page.getByTestId("user-results-tab").click();
		await expect(
			page.getByTestId("tournament-name-cell").first(),
		).toContainText("Paddling Pool 253");

		await page.getByTestId("mates-button").first().click();
		await expect(
			page.locator('[data-testid="mates-cell-placement-0"] li'),
		).toHaveCount(3);

		// if more assertions added below we need to close the popover first (data-testid="underlay")
	});

	test("changes SOS format and progresses with it & adds a member to another team", async ({
		page,
	}) => {
		const tournamentId = 4;

		await seed(page, "SMALL_SOS");
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		await page.getByTestId("edit-event-info-button").click();
		await page.getByTestId("delete-bracket-button").last().click();
		await page.getByTestId("placements-input").last().fill("3,4");

		await submit(page);

		await page.getByTestId("brackets-tab").click();
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		for (const matchId of [1, 2, 3, 4, 5, 6]) {
			await page.locator(`[data-match-id="${matchId}"]`).click();
			await reportResult({
				page,
				amountOfMapsToReport: 2,
				sidesWithMoreThanFourPlayers: [],
				points: [100, 0],
			});
			await backToBracket(page);
		}

		await page.getByRole("button", { name: "Hammerhead" }).click();
		await isNotVisible(page.getByTestId("brackets-viewer"));

		await page.getByRole("button", { name: "Mako" }).click();
		await expect(page.getByTestId("brackets-viewer")).toBeVisible();

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await page.locator('[data-match-id="7"]').click();
		await expect(page.getByTestId("back-to-bracket-button")).toBeVisible();

		await page.getByTestId("admin-tab").click();
		await page.getByLabel("Action").selectOption("ADD_MEMBER");
		await page.getByLabel("Team", { exact: true }).selectOption("303"); // a team in the Mako bracket
		await selectUser({
			labelName: "User",
			userName: "Sendou",
			page,
		});
		await submit(page);

		await page.getByTestId("teams-tab").click();

		await expect(
			page.getByTestId("team-member-name").getByText("Sendou"),
		).toHaveCount(2);
	});

	test("conducts a tournament with many starting brackets", async ({
		page,
	}) => {
		const tournamentId = 4;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		await page.getByTestId("edit-event-info-button").click();
		await page.getByTestId("delete-bracket-button").last().click();

		for (const toggle of await page
			.getByTestId("follow-up-bracket-switch")
			.all()) {
			await toggle.click();
		}

		await page.getByLabel("Format").first().selectOption("Single-elimination");
		await page.getByLabel("Format").nth(1).selectOption("Single-elimination");
		await page.getByLabel("Format").nth(2).selectOption("Swiss");
		await page.getByLabel("Format").nth(3).selectOption("Swiss");

		await submit(page);

		await page.getByText("Seeds").click();
		await page.getByTestId("set-starting-brackets").click();

		for (let i = 0; i < 16; i++) {
			let bracketName: string;
			if (i < 4) {
				bracketName = "Groups stage";
			} else if (i < 8) {
				bracketName = "Great White";
			} else if (i < 12) {
				bracketName = "Hammerhead";
			} else {
				bracketName = "Mako";
			}

			await page
				.getByTestId("starting-bracket-select")
				.nth(i)
				.selectOption(bracketName);
		}

		await submit(page, "set-starting-brackets-submit-button");

		await page.getByTestId("brackets-tab").click();
		for (const bracketName of [
			"Groups stage",
			"Great White",
			"Hammerhead",
			"Mako",
		]) {
			await page.getByRole("button", { name: bracketName }).click();
			await page.getByTestId("finalize-bracket-button").click();
			await submit(page, "confirm-finalize-bracket-button");
		}

		await expect(page.locator('[data-match-id="11"]')).toBeVisible();
	});

	test("organizer edits a match after it is done", async ({ page }) => {
		const tournamentId = 3;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentPage(tournamentId),
		});

		await page.getByTestId("brackets-tab").click();
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await page.locator('[data-match-id="2"]').click();
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["first"],
			points: [100, 0],
		});

		await page.getByTestId("actions-tab").click();
		await page.getByTestId("revise-button").click();
		await page.getByTestId("player-checkbox-3").first().click();
		await page.getByTestId("player-checkbox-4").first().click();
		await page.getByTestId("points-input-1").fill("99");
		await submit(page, "save-revise-button");

		await expect(page.getByTestId("revise-button")).toBeVisible();
		await expect(
			page.getByTestId("player-checkbox-3").first(),
		).not.toBeChecked();
		await expect(page.getByText("99p")).toBeVisible();
	});

	test("changes to picked map pool & best of", async ({ page }) => {
		const tournamentId = 4;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		await page.getByTestId("edit-event-info-button").click();

		await page.getByRole("button", { name: "Clear" }).click();
		await page.getByLabel("Template").selectOption("preset:CB");

		await submit(page);

		await page.getByTestId("brackets-tab").click();
		await page.getByTestId("finalize-bracket-button").click();
		await page.getByTestId("increase-map-count-button").first().click();
		await submit(page, "confirm-finalize-bracket-button");

		await page.locator('[data-match-id="1"]').click();
		await expect(page.getByTestId("mode-progress-CB")).toHaveCount(5);
	});

	test("reopens round robin match and changes score", async ({ page }) => {
		const tournamentId = 3;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		// needs also to be completed so 9 unlocks
		await navigateToMatch(page, 7);
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["last"],
			points: [100, 0],
		});
		await backToBracket(page);

		// set situation where match A is completed and its participants also completed their follow up matches B & C
		// and then we go back and change the winner of A
		await navigateToMatch(page, 8);
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["first"],
			points: [100, 0],
		});
		await backToBracket(page);

		await navigateToMatch(page, 9);
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["last"],
			points: [100, 0],
		});
		await backToBracket(page);

		await navigateToMatch(page, 10);
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["last"],
			points: [100, 0],
		});
		await backToBracket(page);

		await navigateToMatch(page, 8);
		await submit(page, "reopen-match-button");
		await submit(page, "undo-score-button");
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["first"],
			points: [0, 100],
			winner: 2,
		});
	});

	test("locks/unlocks matches & sets match as casted", async ({ page }) => {
		const tournamentId = 2;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentPage(tournamentId),
		});

		await page.getByTestId("admin-tab").click();

		await page.getByLabel("Action").selectOption("CHECK_OUT");

		for (let id = 103; id < 115; id++) {
			await page.getByLabel("Team", { exact: true }).selectOption(String(id));
			await submit(page);
		}

		await page.getByLabel("Twitch accounts").fill("test");
		await submit(page, "save-cast-twitch-accounts-button");

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await page.locator('[data-match-id="1"]').click();
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["last"],
		});
		await backToBracket(page);

		await page.locator('[data-match-id="3"]').click();
		await submit(page, "cast-info-submit-button");
		await backToBracket(page);

		await page.locator('[data-match-id="2"]').click();
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["last"],
		});
		await backToBracket(page);

		await expect(page.getByText("🔒 CAST")).toBeVisible();
		await page.locator('[data-match-id="3"]').click();
		await expect(page.getByText("Match locked to be casted")).toBeVisible();
		await submit(page, "cast-info-submit-button");
		await expect(page.getByTestId("stage-banner")).toBeVisible();

		await page.getByTestId("cast-info-select").selectOption("test");
		await submit(page, "cast-info-submit-button");
		await backToBracket(page);
		await expect(page.getByText("🔴 LIVE")).toBeVisible();
	});

	test("resets bracket", async ({ page }) => {
		const tournamentId = 1;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await isNotVisible(page.locator('[data-match-id="1"]'));
		await page.locator('[data-match-id="2"]').click();
		await reportResult({
			page,
			amountOfMapsToReport: 2,
			sidesWithMoreThanFourPlayers: ["last"],
		});

		await page.getByTestId("admin-tab").click();
		await page
			.getByLabel('Type bracket name ("Main bracket") to confirm')
			.fill("Main bracket");
		await submit(page, "reset-bracket-button");

		await page.getByLabel("Action").selectOption("CHECK_IN");
		await page.getByLabel("Team", { exact: true }).selectOption("1");
		await submit(page);

		await page.getByTestId("brackets-tab").click();
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");
		// bye is gone
		await expect(page.locator('[data-match-id="1"]')).toBeVisible();
	});

	test("user no screen setting affects tournament match", async ({ page }) => {
		const tournamentId = 4;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: SETTINGS_PAGE,
		});

		await page.getByTestId("UPDATE_NO_SCREEN-switch").click();

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await page.locator('[data-match-id="1"]').click();
		await expect(page.getByTestId("screen-banned")).toBeVisible();

		await backToBracket(page);
		await page.locator('[data-match-id="2"]').click();
		await expect(page.getByTestId("screen-allowed")).toBeVisible();
	});

	test("hosts a 'play all' round robin stage", async ({ page }) => {
		const tournamentId = 4;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await page
			.getByLabel("Count type", { exact: true })
			.selectOption("PLAY_ALL");
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 1);
		await expect(page.getByText("Play all 3")).toBeVisible();
		await reportResult({
			page,
			amountOfMapsToReport: 3,
			points: [100, 0],
			sidesWithMoreThanFourPlayers: ["last"],
			winner: 1,
		});
	});

	test("swiss tournament with bracket advancing/unadvancing & dropping out a team", async ({
		page,
	}) => {
		const tournamentId = 5;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		// report all group A round 1 scores
		for (const id of [1, 2, 3, 4]) {
			await page.locator(`[data-match-id="${id}"]`).click();
			await reportResult({
				page,
				amountOfMapsToReport: 2,
				sidesWithMoreThanFourPlayers: id === 1 ? [] : ["last"],
			});
			await backToBracket(page);
		}

		// test that we can change to view different group
		await expect(page.getByTestId("start-round-button")).toBeVisible();
		await page.getByTestId("group-B-button").click();
		await isNotVisible(page.getByTestId("start-round-button"));
		await page.getByTestId("group-A-button").click();

		await submit(page, "start-round-button");
		await expect(page.locator(`[data-match-id="9"]`)).toBeVisible();

		await page.getByTestId("admin-tab").click();

		await page.getByLabel("Action").selectOption("DROP_TEAM_OUT");
		await page.getByLabel("Team", { exact: true }).selectOption("401");
		await submit(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("reset-round-button").click();
		await submit(page, "confirm-button");
		await submit(page, "start-round-button");
		await expect(page.getByTestId("bye-team")).toBeVisible();
	});

	test("prepares maps (including third place match linking)", async ({
		page,
	}) => {
		const tournamentId = 4;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByRole("button", { name: "Great White" }).click();

		await page.getByTestId("prepare-maps-button").click();

		await page.getByLabel("Expected teams").selectOption("8");

		await submit(page, "confirm-finalize-bracket-button");

		await expect(page.getByTestId("prepared-maps-check-icon")).toBeVisible();

		// we did not prepare maps for group stage
		await page.getByRole("button", { name: "Groups stage" }).click();

		await isNotVisible(page.getByTestId("prepared-maps-check-icon"));

		// should reuse prepared maps from Great White
		await page.getByRole("button", { name: "Hammerhead" }).click();

		await expect(page.getByTestId("prepared-maps-check-icon")).toBeVisible();

		// finally, test third place match linking
		await page.getByRole("button", { name: "Great White" }).click();

		await page.getByTestId("prepare-maps-button").click();

		await page.getByTestId("unlink-finals-3rd-place-match-button").click();

		await page.getByTestId("increase-map-count-button").last().click();

		await submit(page, "confirm-finalize-bracket-button");

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByRole("button", { name: "Great White" }).click();

		await page.getByTestId("prepare-maps-button").click();

		// link button should be visible because we unlinked and made finals and third place match maps different earlier
		await expect(
			page.getByTestId("link-finals-3rd-place-match-button"),
		).toBeVisible();
	});

	for (const pickBan of ["COUNTERPICK", "BAN_2"]) {
		test(`ban/pick ${pickBan}`, async ({ page }) => {
			const tournamentId = 4;
			const matchId = 2;

			await seed(page);
			await impersonate(page);

			await navigate({
				page,
				url: tournamentBracketsPage({ tournamentId }),
			});

			await page.getByTestId("finalize-bracket-button").click();
			await page.getByLabel("Pick/ban").selectOption(pickBan);

			await submit(page, "confirm-finalize-bracket-button");

			const teamOneCaptainId = 33;
			const teamTwoCaptainId = 29;

			if (pickBan === "BAN_2") {
				for (const id of [teamTwoCaptainId, teamOneCaptainId]) {
					await impersonate(page, id);
					await navigate({
						page,
						url: tournamentMatchPage({ tournamentId, matchId }),
					});
					await page.getByTestId("actions-tab").click();

					await page.getByTestId("pick-ban-button").first().click();
					await submit(page);
				}

				await expect(
					page.locator(".tournament-bracket__mode-progress__image__banned"),
				).toHaveCount(2);
			}

			await impersonate(page, teamOneCaptainId);

			await navigate({
				page,
				url: tournamentMatchPage({ tournamentId, matchId }),
			});

			await page.getByTestId("actions-tab").click();
			await page.getByTestId("winner-radio-2").click();
			await page.getByTestId("points-input-2").fill("100");
			await submit(page, "report-score-button");

			if (pickBan === "COUNTERPICK") {
				await page.getByTestId("pick-ban-button").first().click();
				await submit(page);
			}

			await impersonate(page, teamTwoCaptainId);

			await navigate({
				page,
				url: tournamentMatchPage({ tournamentId, matchId }),
			});

			await page.getByTestId("actions-tab").click();
			await page.getByTestId("winner-radio-1").click();
			await page.getByTestId("points-input-1").fill("100");
			await submit(page, "report-score-button");

			if (pickBan === "COUNTERPICK") {
				await page.getByTestId("pick-ban-button").first().click();
				await submit(page);

				await submit(page, "undo-score-button");
				await page.getByTestId("winner-radio-1").click();
				await page.getByTestId("points-input-1").fill("100");
				await submit(page, "report-score-button");
				await page.getByTestId("pick-ban-button").last().click();
				await submit(page);
				await expect(
					page.getByText("Counterpick", { exact: true }),
				).toBeVisible();
				await expect(page.getByText("1-1")).toBeVisible();
			}
		});
	}

	test("can end set early when past time limit and shows timer on bracket and match page", async ({
		page,
	}) => {
		const tournamentId = 2;
		const matchId = 5;

		await startBracket(page, tournamentId);
		await navigateToMatch(page, matchId);

		await page.clock.install({ time: new Date() });

		await reportResult({ page, amountOfMapsToReport: 1, winner: 1 });

		await expect(page.getByTestId("match-timer")).toBeVisible();

		await backToBracket(page);

		// Fast forward a bit to ensure timer shows on bracket
		await page.clock.fastForward("00:10"); // 10 seconds
		await page.waitForTimeout(1000);

		const bracketMatch = page.locator('[data-match-id="5"]');
		await expect(bracketMatch).toBeVisible();

		// Fast forward time past limit (30 minutes for Bo3 = 26min limit)
		await page.clock.fastForward("29:50"); // Total 30 minutes
		await page.reload();

		await navigateToMatch(page, matchId);

		await page.getByText("End Set").click();
		await page.getByRole("radio", { name: /Random/ }).check();
		await submit(page, "end-set-button");

		// Verify match ended early
		await expect(page.getByText("Match ended early")).toBeVisible();
	});

	test("dropping team out ends ongoing match early and auto-forfeits losers bracket match", async ({
		page,
	}) => {
		const tournamentId = 2;

		await startBracket(page, tournamentId);

		// 1) Report partial score on match 5 (winners bracket)
		await navigateToMatch(page, 5);
		await reportResult({ page, amountOfMapsToReport: 1, winner: 1 });
		await backToBracket(page);

		// 2) Drop team 102 (one of the teams in match 5) via admin
		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});
		await page.getByLabel("Action").selectOption("DROP_TEAM_OUT");
		await page.getByLabel("Team", { exact: true }).selectOption("102");
		await submit(page);

		// 3) Verify the ongoing match ended early
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId: 5 }),
		});
		await expect(page.getByText("Match ended early")).toBeVisible();
		await expect(page.getByText("dropped out of the tournament")).toBeVisible();
		await backToBracket(page);

		// 4) Complete the adjacent match (match 6) so its loser goes to losers bracket
		await navigateToMatch(page, 6);
		await reportResult({ page, amountOfMapsToReport: 2 });
		await backToBracket(page);

		// 5) The losers bracket match (match 18) should now have teams:
		//    - Loser of match 5 (team 102, dropped)
		//    - Loser of match 6
		//    It should have ended early since team 102 is dropped
		await navigateToMatch(page, 18);
		await expect(page.getByText("Match ended early")).toBeVisible();
		await expect(page.getByText("dropped out of the tournament")).toBeVisible();
	});
});
