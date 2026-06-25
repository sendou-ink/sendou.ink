import type { Locator, Page } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";
import { updateMatchProfileSchema } from "~/features/settings/match-profile-schemas";
import {
	NOTIFICATIONS_URL,
	SETTINGS_PAGE,
	tournamentAdminPage,
	tournamentAdminRegistrationEditPage,
	tournamentBracketsPage,
	tournamentMatchPage,
	tournamentPage,
	tournamentTeamsPage,
	userResultsPage,
} from "~/utils/urls";
import {
	clickNavTab,
	expect,
	impersonate,
	isNotVisible,
	modalClickConfirmButton,
	navigate,
	seed,
	startBracket,
	submit,
	test,
	waitForPOSTResponse,
} from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";
import {
	backToBracket,
	expectScore,
	goToTab,
	navigateToMatch,
	reportResult,
	undoLastReport,
} from "./helpers/tournament-match";

test.describe("Tournament bracket", () => {
	test("sets active roster as regular member", async ({ page }) => {
		const tournamentId = 1;
		// User 37 is owner of team 10 (seed 10) which has 5 players
		// Team 10 vs Team 9 (seed 9) is match 2 in WB Round 1
		const matchId = 2;
		await startBracket(page, tournamentId);

		await impersonate(page, 37);
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});

		await expect(page.getByTestId("active-roster-needed-text")).toBeVisible();

		// Team 10 (5 players) is opponentTwo in match 2 → bravo side.
		// The roster tab opens in editing mode by default when active roster is missing.
		await goToTab(page, "rosters");
		await page.getByTestId("player-checkbox-bravo-0").click();
		await page.getByTestId("player-checkbox-bravo-1").click();
		await page.getByTestId("player-checkbox-bravo-2").click();
		await page.getByTestId("player-checkbox-bravo-3").click();
		await submit(page, "save-active-roster-button-bravo");

		// did it persist?
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});
		await isNotVisible(page.getByTestId("active-roster-needed-text"));

		await goToTab(page, "rosters");
		await page.getByTestId("edit-active-roster-button-bravo").click();
		// Swap player 3 out for player 4
		await page.getByTestId("player-checkbox-bravo-3").click();
		await page.getByTestId("player-checkbox-bravo-4").click();
		await submit(page, "save-active-roster-button-bravo");

		await expect(
			page.getByTestId("edit-active-roster-button-bravo"),
		).toBeVisible();
	});

	// 1) Report winner of N-ZAP's first match
	// 2) Report winner of the adjacent match by using admin powers
	// 3) Report one match on the only losers side match available
	// 4) Try to reopen N-ZAP's first match and fail
	// 5) Undo score of first losers match
	// 6) Try to reopen N-ZAP's first match and succeed
	// 7) As N-ZAP, undo all scores and switch to different team sweeping
	test("reports score and sees bracket update", async ({ page }) => {
		test.slow();
		const tournamentId = 2;
		await startBracket(page);

		await impersonate(page);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		// 1)
		await navigateToMatch(page, 5);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		// 2)
		await impersonate(page);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await navigateToMatch(page, 6);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		// 3)
		await navigateToMatch(page, 18);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 1, setEnds: false });
		await backToBracket(page);

		// 4)
		await navigateToMatch(page, 5);
		await goToTab(page, "admin");
		await isNotVisible(page.getByTestId("reopen-match-button"));
		await backToBracket(page);

		// 5)
		await navigateToMatch(page, 18);
		await goToTab(page, "action");
		await undoLastReport(page);
		await expectScore(page, [0, 0]);
		await backToBracket(page);

		// 6)
		await navigateToMatch(page, 5);
		await goToTab(page, "admin");
		await submit(page, "reopen-match-button");
		await expectScore(page, [1, 0]);

		// 7)
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await navigateToMatch(page, 5);
		await goToTab(page, "action");
		await undoLastReport(page);
		await expectScore(page, [0, 0]);
		await reportResult(page, { mapsToReport: 2, winner: 2 });
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
		test.slow();

		const tournamentId = 2;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		// check out teams 103-116 (rows are sorted by seed)
		await checkOutTeamRows(page, 2, 15);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 1);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
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

		await expect(
			page.getByTestId("tournament-name-cell").getByText("In The Zone 22"),
		).toBeVisible();

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
		test.setTimeout(150_000);

		const tournamentId = 3;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		// check out teams 202-209 (rows are sorted by seed)
		await checkOutTeamRows(page, 1, 8);

		await navigate({
			page,
			url: tournamentBracketsPage({
				tournamentId,
			}),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		for (const id of [2, 4, 6, 7, 8, 9, 10, 11, 12]) {
			await navigateToMatch(page, id);
			await goToTab(page, "action");
			await reportResult(page, { mapsToReport: 2 });
			await backToBracket(page);
		}

		// captain of one of the underground bracket teams
		await impersonate(page, 57);
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByRole("tab", { name: "Underground" }).click();
		await submit(page, "check-in-bracket-button");

		await impersonate(page);
		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		// check team 216 in to the underground bracket — match on the stable team
		// id rather than the seeded (faker-generated) team name or the row index,
		// neither of which is stable after the start
		await adminTeamRowAction(
			page,
			page.locator('[data-testid="team-row"][data-team-id="216"]'),
			"Check in (Underground bracket)",
		);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId, bracketIdx: 2 }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 13);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 3 });

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId, bracketIdx: 1 }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");
		for (const matchId of [14, 15, 16, 17]) {
			await navigateToMatch(page, matchId);
			await goToTab(page, "action");
			await reportResult(page, { mapsToReport: 3 });

			await backToBracket(page);
		}
		await page.getByTestId("finalize-tournament-button").click();
		await page.getByTestId("assign-badges-later-switch").click();
		await submit(page, "confirm-button");

		// after finalizing the tournament, the admin tab disappears so the
		// reopen action is no longer reachable
		await navigateToMatch(page, 14);
		await isNotVisible(page.getByRole("tab", { name: "Admin" }));
		await isNotVisible(page.getByTestId("reopen-match-button"));
		await backToBracket(page);
	});

	test("shows tournament results on user profile after finalized tournament", async ({
		page,
	}) => {
		test.slow();
		const tournamentId = 4;

		await seed(page, "SMALL_SOS");
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		// check out teams 303 & 304 (rows are sorted by seed)
		await checkOutTeamRows(page, 2, 3);

		await page.getByTestId("edit-event-info-button").click();
		for (let i = 0; i < 3; i++) {
			await page.getByTestId("delete-bracket-button").last().click();
		}
		await page.getByTestId("placements-input").last().fill("1,2");
		await submit(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 1);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		await page.getByRole("tab", { name: "Great White" }).click();
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 2);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 3 });
		await backToBracket(page);

		await page.getByTestId("finalize-tournament-button").click();
		await page.getByRole("button", { name: "Finalize" }).click();

		await page.getByTestId("results-tab").click();
		await page.getByTestId("result-team-name").first().click();
		await page.getByTestId("team-member-name").first().click();

		await page.getByTestId("user-seasons-tab").click();
		await expect(page.getByTestId("seasons-tournament-result")).toBeVisible();

		await page.getByTestId("user-results-tab").click();
		await expect(
			page.getByTestId("tournament-name-cell").first(),
		).toContainText("Swim or Sink 101");

		await page.getByTestId("mates-button").first().click();
		await expect(
			page.locator('[data-testid="mates-cell-placement-0"] li'),
		).toHaveCount(3);
	});

	test("changes SOS format and progresses with it & adds a member to another team", async ({
		page,
	}) => {
		test.slow();
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

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		for (const matchId of [1, 2, 3, 4, 5, 6]) {
			await navigateToMatch(page, matchId);
			await goToTab(page, "action");
			await reportResult(page, { mapsToReport: 2 });
			await backToBracket(page);
		}

		await page.getByRole("tab", { name: "Hammerhead" }).click();
		await isNotVisible(page.getByTestId("brackets-viewer"));

		await page.getByRole("tab", { name: "Mako" }).click();
		await expect(page.getByTestId("brackets-viewer")).toBeVisible();

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 7);
		await expect(page.getByTestId("back-to-bracket-button")).toBeVisible();

		// add Sendou to team 303 (a team in the Mako bracket)
		await navigate({
			page,
			url: tournamentAdminRegistrationEditPage(tournamentId, 303),
		});
		await page.getByRole("button", { name: "Add", exact: true }).click();
		await page.getByLabel("Player").last().click();
		await page.getByTestId("user-search-input").fill("Sendou");
		await expect(page.getByTestId("user-search-item").first()).toBeVisible();
		await page.keyboard.press("Enter");
		await submit(page);

		await navigate({
			page,
			url: tournamentTeamsPage(tournamentId),
		});

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

		await navigate({
			page,
			url: `${tournamentAdminPage(tournamentId)}/seeds`,
		});
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

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		for (const bracketName of [
			"Groups stage",
			"Great White",
			"Hammerhead",
			"Mako",
		]) {
			await page.getByRole("tab", { name: bracketName }).click();
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

		await navigateToMatch(page, 2);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });

		await goToTab(page, "admin");
		await page.getByTestId("edit-result-0-button").click();
		// Swap player 3 out for player 4 on the alpha (winner) team
		await page.getByTestId("edit-result-player-checkbox-alpha-3").click();
		await page.getByTestId("edit-result-player-checkbox-alpha-4").click();
		// Toggle KO so we can verify the edit went through (RR collects KO).
		await page.getByLabel("KO").check();
		await submit(page, "save-result-0-button");

		// Edit returns to read-only view, now showing the KO label
		await expect(page.getByTestId("edit-result-0-button")).toBeVisible();
		await expect(page.getByText(/\(KO\)/).first()).toBeVisible();
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

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await page.getByTestId("increase-map-count-button").first().click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 1);
		// Bo5 of clam blitz: one mode icon + ×5 count text
		await expect(page.getByTestId("mode-progress-CB")).toBeVisible();
		await expect(page.getByText("×5")).toBeVisible();
	});

	test("reopens round robin match and changes score", async ({ page }) => {
		test.slow();
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
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		// set situation where match A is completed and its participants also completed their follow up matches B & C
		// and then we go back and change the winner of A
		await navigateToMatch(page, 8);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		await navigateToMatch(page, 9);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		await navigateToMatch(page, 10);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		await navigateToMatch(page, 8);
		await goToTab(page, "admin");
		await submit(page, "reopen-match-button");
		await goToTab(page, "action");
		await undoLastReport(page);
		await reportResult(page, {
			mapsToReport: 2,
			winner: 2,
			setEnds: true,
		});
	});

	test("reopening round robin match does not lock already-unlocked matches (issue #2690)", async ({
		page,
	}) => {
		const tournamentId = 3;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		// Use Group B which has 4 teams and 2 matches per round
		// Group B Round 1: Match 7 (Whatcha Say vs Come Together), Match 8 (We Are Champions vs Please Mr Postman)
		// Group B Round 2: Match 9 (Please Mr Postman vs Come Together), Match 10 (Whatcha Say vs We Are Champions)

		// Complete R1 matches in group B (matches 7 and 8) to unlock R2 matches
		await navigateToMatch(page, 7);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		await navigateToMatch(page, 8);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		// Match 9 is R2 in group B - should now be unlocked since R1 is complete
		// Start it but don't complete it
		await navigateToMatch(page, 9);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 1, setEnds: false });
		await backToBracket(page);

		// Reopen match 7 (R1 match) - simulating a score misreport correction
		await navigateToMatch(page, 7);
		await goToTab(page, "admin");
		await submit(page, "reopen-match-button");
		await backToBracket(page);

		// Verify the R2 match that was already in progress is still playable
		// Before the fix, this would become locked and unplayable
		await navigateToMatch(page, 9);
		await expectScore(page, [1, 0]);
		await goToTab(page, "action");
		await expect(page.getByTestId("winner-radio-1")).toBeVisible();
	});

	test("locks/unlocks matches & sets match as casted", async ({ page }) => {
		test.slow();

		const tournamentId = 2;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		// check out teams 103-114 (rows are sorted by seed)
		await checkOutTeamRows(page, 2, 13);

		await page.getByRole("tab", { name: "Stream" }).click();
		// an empty array field already renders one placeholder input
		await page.getByPlaceholder("dappleproductions").fill("test");
		await submit(page, "save-cast-twitch-accounts-button");

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 1);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		await navigateToMatch(page, 3);
		await goToTab(page, "admin");
		// Picking a chip auto-submits the cast channel; lock the match afterwards.
		await waitForPOSTResponse(page, async () => {
			await page.locator('label[for$="-test"]').click();
		});
		await submit(page, "cast-info-submit-button");
		await backToBracket(page);

		await navigateToMatch(page, 2);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		await expect(page.getByText("🔒 CAST")).toBeVisible();
		await navigateToMatch(page, 3);
		await goToTab(page, "admin");
		// Lock state is signalled by the toggle being "Unlock" instead of "Lock"
		await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
		// A locked match still needs to show the pool & room pass so players can join
		await expect(page.getByText("Pool", { exact: true })).toBeVisible();
		await expect(page.getByTestId("room-pass")).toBeVisible();
		await submit(page, "cast-info-submit-button");
		await expect(page.getByTestId("stage-banner")).toBeVisible();

		// Cast channel "test" persists across unlock; the bracket badge flips
		// from 🔒 CAST to 🔴 LIVE once the match is unlocked and ongoing.
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
		await navigateToMatch(page, 2);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });

		await clickNavTab(page, "admin-tab");
		await page.getByRole("tab", { name: "Brackets" }).click();
		await page
			.getByLabel('Type bracket name ("Main bracket") to confirm')
			.fill("Main bracket");
		await submit(page, "reset-bracket-button");

		await page.getByRole("tab", { name: "Teams" }).click();
		// check team 1 (seed 1) back in
		await adminTeamRowAction(
			page,
			page.getByTestId("team-row").first(),
			/^Check in/,
		);

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

		const form = createFormHelpers(page, updateMatchProfileSchema);
		await form.check("noScreen");
		await waitForPOSTResponse(page, () => form.submit());

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		await navigateToMatch(page, 1);
		await expect(page.getByTestId("screen-banned")).toBeVisible();

		await backToBracket(page);
		await navigateToMatch(page, 2);
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
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 3 });
	});

	test("swiss tournament with bracket advancing/unadvancing & dropping out a team", async ({
		page,
	}) => {
		test.slow();

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
			await navigateToMatch(page, id);
			await goToTab(page, "action");
			await reportResult(page, { mapsToReport: 2 });
			await backToBracket(page);
		}

		// test that we can change to view different group
		await expect(page.getByTestId("start-round-button")).toBeVisible();
		await page.getByTestId("group-B-button").click();
		await isNotVisible(page.getByTestId("start-round-button"));
		await page.getByTestId("group-A-button").click();

		await submit(page, "start-round-button");
		await expect(page.locator(`[data-match-id="9"]`)).toBeVisible();

		await clickNavTab(page, "admin-tab");

		// drop out team 401 (seed 1)
		await page.getByTestId("team-row").nth(0).getByLabel("Actions").click();
		await page.getByRole("menuitem", { name: "Drop out" }).click();
		await modalClickConfirmButton(page);

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

		await page.getByRole("tab", { name: "Great White" }).click();

		await page.getByTestId("prepare-maps-button").click();

		await page.getByLabel("Expected teams").selectOption("8");

		await submit(page, "confirm-finalize-bracket-button");

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByRole("tab", { name: "Great White" }).click();

		await expect(page.getByTestId("prepared-maps-check-icon")).toBeVisible();

		// we did not prepare maps for group stage
		await page.getByRole("tab", { name: "Groups stage" }).click();

		await isNotVisible(page.getByTestId("prepared-maps-check-icon"));

		// should reuse prepared maps from Great White
		await page.getByRole("tab", { name: "Hammerhead" }).click();

		await expect(page.getByTestId("prepared-maps-check-icon")).toBeVisible();

		// finally, test third place match linking
		await page.getByRole("tab", { name: "Great White" }).click();

		await page.getByTestId("prepare-maps-button").click();

		await page.getByTestId("unlink-finals-3rd-place-match-button").click();

		await page.getByTestId("increase-map-count-button").last().click();

		await submit(page, "confirm-finalize-bracket-button");

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByRole("tab", { name: "Great White" }).click();

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
					await goToTab(page, "action");

					await page.getByTestId("pick-ban-button").first().click();
					await submit(page, "pick-ban-submit-button");
				}

				// once both teams banned the ban prompt is gone and the actual map
				// banner takes over.
				await expect(page.getByTestId("stage-banner")).toBeVisible();
			}

			await impersonate(page, teamOneCaptainId);

			await navigate({
				page,
				url: tournamentMatchPage({ tournamentId, matchId }),
			});

			await goToTab(page, "action");
			await reportResult(page, { mapsToReport: 1, winner: 2, setEnds: false });

			if (pickBan === "COUNTERPICK") {
				await page.getByTestId("pick-ban-button").first().click();
				await submit(page, "pick-ban-submit-button");
			}

			await impersonate(page, teamTwoCaptainId);

			await navigate({
				page,
				url: tournamentMatchPage({ tournamentId, matchId }),
			});

			await goToTab(page, "action");
			await reportResult(page, { mapsToReport: 1, winner: 1, setEnds: false });

			if (pickBan === "COUNTERPICK") {
				await page.getByTestId("pick-ban-button").first().click();
				await submit(page, "pick-ban-submit-button");

				await undoLastReport(page);
				await expect(page.getByText("Select the winner")).toBeVisible();
				await reportResult(page, {
					mapsToReport: 1,
					winner: 1,
					setEnds: false,
				});
				await page.getByTestId("pick-ban-button").last().click();
				await submit(page, "pick-ban-submit-button");
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

		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 1, winner: 1, setEnds: false });

		await expect(page.getByTestId("match-timer")).toBeVisible();

		await backToBracket(page);

		const bracketMatch = page.locator('[data-match-id="5"]');
		await expect(bracketMatch).toBeVisible();

		// Verify timer shows on bracket page (timer is a sibling of the match link)
		const matchWrapper = bracketMatch.locator("..");
		await expect(matchWrapper.getByTestId("bracket-match-timer")).toBeVisible();

		// Fast forward time past limit (30 minutes for Bo3 = 26min limit)
		await page.clock.fastForward("30:00");
		await page.reload();

		await navigateToMatch(page, matchId);

		await goToTab(page, "admin");
		await page.getByRole("button", { name: "End set" }).click();
		await page.getByRole("radio", { name: /Random/ }).check();
		await submit(page, "end-set-button");

		// Match is now finalized (no longer ongoing) → "Final" appears in banner
		await expect(page.getByTestId("match-final")).toBeVisible();
	});

	test("dropping team out ends ongoing match early and auto-forfeits losers bracket match", async ({
		page,
	}) => {
		const tournamentId = 2;

		await startBracket(page, tournamentId);

		// 1) Report partial score on match 5 (winners bracket)
		await navigateToMatch(page, 5);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 1, winner: 1, setEnds: false });
		await backToBracket(page);

		// 2) Drop team 102 (one of the teams in match 5) via admin
		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});
		// drop out team 102 (seed 2)
		await page.getByTestId("team-row").nth(1).getByLabel("Actions").click();
		await page.getByRole("menuitem", { name: "Drop out" }).click();
		await modalClickConfirmButton(page);

		// 3) Verify the ongoing match ended early (no longer ongoing → "Final")
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId: 5 }),
		});
		await expect(page.getByTestId("match-final")).toBeVisible();
		await backToBracket(page);

		// 4) Complete the adjacent match (match 6) so its loser goes to losers bracket
		await navigateToMatch(page, 6);
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 2 });
		await backToBracket(page);

		// 5) The losers bracket match (match 18) should now have teams:
		//    - Loser of match 5 (team 102, dropped)
		//    - Loser of match 6
		//    It should have ended early since team 102 is dropped
		await navigateToMatch(page, 18);
		await expect(page.getByTestId("match-final")).toBeVisible();
	});

	test("ban/pick CUSTOM flow", async ({ page }) => {
		test.slow();
		const tournamentId = 4;
		const matchId = 2;
		const higherSeedCaptainId = 29;
		const lowerSeedCaptainId = 33;

		const customFlow = {
			preSet: [
				{ action: "BAN", side: "HIGHER_SEED" },
				{ action: "BAN", side: "HIGHER_SEED" },
				{ action: "BAN", side: "LOWER_SEED" },
				{ action: "BAN", side: "LOWER_SEED" },
				{ action: "ROLL" },
			],
			postGame: [
				{ action: "BAN", side: "WINNER" },
				{ action: "BAN", side: "WINNER" },
				{ action: "PICK", side: "LOSER" },
			],
		};

		// 1) Start bracket with CUSTOM pick/ban flow
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});

		await page.getByTestId("finalize-bracket-button").click();
		await page.getByLabel("Pick/ban").selectOption("CUSTOM");
		await expect(page.getByText("Before set")).toBeVisible();

		await waitForPOSTResponse(page, async () => {
			await page.evaluate((cfStr) => {
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

		// 2) PreSet: Higher seed bans 2 maps
		await impersonate(page, higherSeedCaptainId);
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});
		await goToTab(page, "action");

		await page.getByTestId("pick-ban-button").first().click();
		await submit(page, "pick-ban-submit-button");

		await expect(page.getByText(/Ban a map \(2\/2\)/)).toBeVisible();
		await page.getByTestId("pick-ban-button").first().click();
		await submit(page, "pick-ban-submit-button");

		// 3) PreSet: Lower seed bans 2 maps
		await impersonate(page, lowerSeedCaptainId);
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});
		await goToTab(page, "action");

		await page.getByTestId("pick-ban-button").first().click();
		await submit(page, "pick-ban-submit-button");

		await expect(page.getByText(/Ban a map \(2\/2\)/)).toBeVisible();
		await page.getByTestId("pick-ban-button").first().click();
		await submit(page, "pick-ban-submit-button");

		// 4) Roll auto-executed after last ban; report game 1 score
		await expect(page.getByTestId("stage-banner")).toBeVisible();
		await goToTab(page, "action");

		await reportResult(page, { mapsToReport: 1, winner: 1, setEnds: false });
		await expectScore(page, [1, 0]);

		// 5) PostGame: Winner (team 1, captain 33) bans 2 maps
		await expect(page.getByText(/Ban a map/)).toBeVisible();
		await page.getByTestId("pick-ban-button").first().click();
		await submit(page, "pick-ban-submit-button");

		await expect(page.getByText(/Ban a map \(2\/2\)/)).toBeVisible();
		await page.getByTestId("pick-ban-button").first().click();
		await submit(page, "pick-ban-submit-button");

		// PostGame: Loser (team 2, captain 29) picks a map
		await impersonate(page, higherSeedCaptainId);
		await navigate({
			page,
			url: tournamentMatchPage({ tournamentId, matchId }),
		});
		await goToTab(page, "action");

		await expect(page.getByText(/Pick a map/)).toBeVisible();
		await page.getByTestId("pick-ban-button").first().click();
		await submit(page, "pick-ban-submit-button");

		// 6) Undo game 1 score — also deletes postGame pick/ban events
		await expect(page.getByTestId("stage-banner")).toBeVisible();
		await undoLastReport(page);

		await expectScore(page, [0, 0]);
		await expect(page.getByTestId("stage-banner")).toBeVisible();

		// 7) Re-report game 1 and verify postGame cycle restarts
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 1, winner: 1, setEnds: false });
		await expectScore(page, [1, 0]);

		await expect(page.getByText(/Ban a map/)).toBeVisible();
	});
});

/** Opens the admin team list row's actions menu and clicks the given menu item, waiting for the resulting POST. */
async function adminTeamRowAction(
	page: Page,
	row: Locator,
	menuItemName: string | RegExp,
) {
	await row.getByLabel("Actions").click();
	await waitForPOSTResponse(page, () =>
		page.getByRole("menuitem", { name: menuItemName }).click(),
	);
}

/** Checks out the admin team list rows in the given inclusive index range (rows are sorted by seed). */
async function checkOutTeamRows(page: Page, fromIdx: number, toIdx: number) {
	for (let i = fromIdx; i <= toIdx; i++) {
		await adminTeamRowAction(
			page,
			page.getByTestId("team-row").nth(i),
			/^Check out/,
		);
	}
}
