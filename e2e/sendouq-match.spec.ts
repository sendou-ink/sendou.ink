import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { SendouQLookingPage } from "./pages/sendouq/sendouq-looking-page";
import { SendouQMatchPage } from "./pages/sendouq/sendouq-match-page";
import { SendouQPage } from "./pages/sendouq/sendouq-page";

test.describe("SendouQ match page", () => {
	test("Score reporting: report, undo, weapon report, confirm", async ({
		page,
		factories,
	}) => {
		const { matchId, alpha, bravo } = await createMatch(factories);

		await impersonate(page, alpha[0].id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);

		await match.reportMapWinner("ALPHA");
		await match.reportMapWinner("ALPHA");

		await expect(match.locators.undoReportButton).toBeVisible();
		await match.undoReport();

		await match.reportMapWinner("ALPHA");

		await match.reportWeapon("Splattershot");
		await expect(match.locators.undoWeaponButton).toBeVisible();

		await match.reportMapWinner("BRAVO");
		await match.reportMapWinner("ALPHA");
		await match.reportSetEndingMap("ALPHA");

		await impersonate(page, bravo[0].id);
		await match.goto(matchId);
		await match.confirmScore();

		await expect(match.score(4, 1)).toBeVisible();

		// Verify the reported Splattershot shows up on the result-tab timeline
		// (the compact action-tab timeline omits per-map weapons).
		await match.goto(matchId, "result");
		await expect(match.reportedWeaponImage("Splattershot")).toBeVisible();
	});

	test("Staff score report: non-participant staff force-reports and locks match", async ({
		page,
		factories,
	}) => {
		const { matchId } = await createMatch(factories);
		const staff = await factories.UserFactory.createStaff();

		await impersonate(page, staff.id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);

		await match.reportSweep("ALPHA");

		await expect(match.score(4, 0)).toBeVisible();
	});

	test("Staff score confirm: confirms participant's 4-0 set-ender locks match", async ({
		page,
		factories,
	}) => {
		const { matchId, alpha, bravo } = await createMatch(factories);
		const staff = await factories.UserFactory.createStaff();

		await impersonate(page, alpha[0].id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);

		await match.reportSweep("ALPHA");

		await impersonate(page, staff.id);
		await match.goto(matchId);
		await match.confirmScore();

		await expect(match.score(4, 0)).toBeVisible();

		// match is locked; the other team now sees the rejoin button
		await impersonate(page, bravo[0].id);
		await match.goto(matchId);
		await expect(match.locators.lookAgainButton).toBeVisible();
	});

	test("Cancel flow: request, refused, re-request, accepted locks match", async ({
		page,
		factories,
	}) => {
		const { matchId, alpha, bravo } = await createMatch(factories);

		await impersonate(page, alpha[0].id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);

		await match.requestCancel();
		await expect(match.locators.cancelPendingText).toBeVisible();

		await impersonate(page, bravo[0].id);
		await match.goto(matchId);
		await expect(match.locators.cancelPrompt).toBeVisible();
		await match.respondToCancel("Refuse");

		await impersonate(page, alpha[0].id);
		await match.goto(matchId);
		await match.requestCancel();

		await impersonate(page, bravo[0].id);
		await match.goto(matchId);
		await match.respondToCancel("Accept");

		await expect(match.locators.canceledText).toBeVisible();
	});

	test("Rejoin: trusted group one-click look again", async ({
		page,
		factories,
	}) => {
		const { matchId, bravo } = await createMatch(factories, {
			isConcluded: true,
		});

		await impersonate(page, bravo[0].id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);
		await match.lookAgain();

		await new SendouQPage(page).goto();
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
	});

	test("Rejoin vote: 'no' shows rejoin queue button that rejoins directly", async ({
		page,
		factories,
	}) => {
		const { matchId, alpha } = await createMatch(factories, {
			isMatchmade: true,
			isConcluded: true,
		});

		await impersonate(page, alpha[0].id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);
		await match.voteNo();

		await expect(match.locators.declinedText).toBeVisible();
		await match.rejoinQueue();

		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
	});

	test("Rejoin vote: cascade wipes yes on no, revote completes and rejoins", async ({
		page,
		factories,
	}) => {
		const { matchId, alpha } = await createMatch(factories, {
			isMatchmade: true,
			isConcluded: true,
		});

		const [owner, memberB, memberC, memberD] = alpha;

		await impersonate(page, owner.id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);
		await match.voteYes();

		await expect(match.locators.votedYes).toHaveCount(1);
		await expect(match.locators.pendingVotes).toHaveCount(3);

		await impersonate(page, memberB.id);
		await match.goto(matchId);
		await match.voteNo();

		await impersonate(page, owner.id);
		await match.goto(matchId);
		// the owner's yes was wiped by member B's no → back to pending
		await expect(match.locators.votedNo).toHaveCount(1);
		await expect(match.locators.votedYes).toHaveCount(0);
		await match.voteYes();

		for (const member of [memberC, memberD]) {
			await impersonate(page, member.id);
			await match.goto(matchId);
			await match.voteYes();
		}

		await impersonate(page, owner.id);
		await new SendouQPage(page).goto();
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);

		// the member who voted no was left behind
		const looking = new SendouQLookingPage(page);
		await expect(looking.ownGroupCard.members).toHaveCount(3);
	});
});

async function createMatch(
	factories: Factories,
	{
		isMatchmade,
		isConcluded,
	}: { isMatchmade?: boolean; isConcluded?: boolean } = {},
) {
	const alpha = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
	const bravo = await factories.UserFactory.createMany(FULL_GROUP_SIZE);

	const match = await factories.SQMatchFactory.create(
		{
			alphaUserIds: alpha.map((member) => member.id),
			bravoUserIds: bravo.map((member) => member.id),
			isMatchmade,
		},
		{ isConcluded },
	);

	return { matchId: match.id, alpha, bravo };
}
