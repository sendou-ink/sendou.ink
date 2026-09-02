import http from "node:http";
import { sub } from "date-fns";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import type { Factories } from "./helpers/factories";
import {
	e2eWebhookPort,
	expect,
	impersonate,
	runRoutine,
	test,
} from "./helpers/playwright";
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

		// the compact action-tab timeline omits per-map weapons, the result tab's shows them
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

	test("Cancel flow: request, refused, re-request, accepted locks match and sends webhook", async ({
		page,
		factories,
	}, testInfo) => {
		const { matchId, alpha, bravo } = await createMatch(factories);

		await impersonate(page, alpha[0].id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);

		await match.requestCancel({ reason: "First cancel reason" });
		await expect(match.locators.cancelPendingText).toBeVisible();

		await impersonate(page, bravo[0].id);
		await match.goto(matchId);
		await expect(match.locators.cancelPrompt).toBeVisible();
		await match.refuseCancel();

		await impersonate(page, alpha[0].id);
		await match.goto(matchId);
		await match.requestCancel({ reason: "Requester network issues" });

		await impersonate(page, bravo[0].id);
		await match.goto(matchId);
		const webhook = await captureCancelWebhook(
			e2eWebhookPort(testInfo.parallelIndex),
			async () => {
				await match.acceptCancel({ reason: "Accepter agrees to cancel" });
			},
		);

		await expect(match.locators.canceledText).toBeVisible();

		expect(webhook.embeds).toHaveLength(1);
		const embed = webhook.embeds[0];
		expect(embed.title).toBe("SendouQ match canceled");

		const fieldValue = (name: string) =>
			embed.fields.find((field) => field.name.startsWith(name))?.value;
		expect(fieldValue("Match")).toContain(`#${matchId}`);
		expect(fieldValue("Requesting team's reason")).toBe(
			"Requester network issues",
		);
		expect(fieldValue("Accepting team's reason")).toBe(
			"Accepter agrees to cancel",
		);
		// both teams nominated the first listed player
		expect(fieldValue("Teams nominated the same players")).toBe("Yes");
		expect(fieldValue("Times nominated in canceled matches")).toMatch(
			/season: 1 • year: 1/,
		);
	});

	test("Auto-resolve: day-old match with no score reported is canceled", async ({
		page,
		factories,
	}) => {
		const { matchId, alpha } = await createMatch(factories, {
			createdAt: sub(new Date(), { hours: 25 }),
		});

		await impersonate(page, alpha[0].id);
		await runRoutine(page, "ResolveStaleSQMatches");

		const match = new SendouQMatchPage(page);
		await match.goto(matchId);

		await expect(match.locators.canceledText).toBeVisible();
	});

	test("Auto-resolve: day-old match the other team never confirmed is confirmed", async ({
		page,
		factories,
	}) => {
		const { matchId, bravo } = await createMatch(factories, {
			isReported: true,
			createdAt: sub(new Date(), { hours: 25 }),
		});

		await impersonate(page, bravo[0].id);
		await runRoutine(page, "ResolveStaleSQMatches");

		const match = new SendouQMatchPage(page);
		await match.goto(matchId);

		await expect(match.score(4, 0)).toBeVisible();
		// the match is locked; a participant now sees the rejoin button
		await expect(match.locators.lookAgainButton).toBeVisible();
	});

	test("Rejoin: trusted group one-click look again", async ({
		page,
		factories,
	}) => {
		const { matchId, bravo } = await createMatch(factories, {
			isConcluded: true,
		});

		// any member can re-queue the group, not only the member who created it
		await impersonate(page, bravo[1].id);
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

	test("Rejoin vote: changing a yes vote to no takes effect", async ({
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

		await match.voteYes();
		await expect(match.locators.votedYes).toHaveCount(1);

		await match.voteNo();

		await expect(match.locators.declinedText).toBeVisible();
	});

	test("Rejoin vote: queueing solo after voting yes shows the rest a no", async ({
		page,
		factories,
	}) => {
		const { matchId, alpha } = await createMatch(factories, {
			isMatchmade: true,
			isConcluded: true,
		});

		const [owner, impatient, memberC, memberD] = alpha;

		await impersonate(page, owner.id);
		const match = new SendouQMatchPage(page);
		await match.goto(matchId);
		await match.voteYes();

		await impersonate(page, impatient.id);
		await match.goto(matchId);
		await match.voteYes();

		// ...and then gives up on waiting for the rest and queues up alone instead
		const q = new SendouQPage(page);
		await q.goto();
		await q.joinSolo();

		await impersonate(page, owner.id);
		await match.goto(matchId);

		// their checkmark turned into a cross, taking the yes votes cast for a
		// group of four with it
		await expect(match.locators.votedNo).toHaveCount(1);
		await expect(match.locators.votedYes).toHaveCount(0);
		await expect(match.locators.pendingVotes).toHaveCount(3);

		for (const member of [owner, memberC, memberD]) {
			await impersonate(page, member.id);
			await match.goto(matchId);
			await match.voteYes();
		}

		// the three who stayed get their group, rather than being sent back to /q
		await impersonate(page, owner.id);
		await q.goto();
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);

		const looking = new SendouQLookingPage(page);
		await expect(looking.ownGroupCard.members).toHaveCount(3);
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

interface WebhookPayload {
	embeds: Array<{
		title: string;
		fields: Array<{ name: string; value: string }>;
	}>;
}

/** Listens on the worker's webhook port for the Discord webhook the `run` callback triggers. */
async function captureCancelWebhook(port: number, run: () => Promise<void>) {
	const payloads: WebhookPayload[] = [];
	const server = http.createServer((req, res) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			payloads.push(JSON.parse(body));
			res.statusCode = 204;
			res.end();
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, resolve);
	});

	try {
		await run();
		await expect
			.poll(() => payloads.length, { timeout: 10_000 })
			.toBeGreaterThan(0);
	} finally {
		await new Promise((resolve) => {
			server.close(resolve);
		});
	}

	return payloads[0];
}

async function createMatch(
	factories: Factories,
	{
		isMatchmade,
		isConcluded,
		isReported,
		createdAt,
	}: {
		isMatchmade?: boolean;
		isConcluded?: boolean;
		isReported?: boolean;
		createdAt?: Date;
	} = {},
) {
	const alpha = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
	const bravo = await factories.UserFactory.createMany(FULL_GROUP_SIZE);

	const match = await factories.SQMatchFactory.create(
		{
			alphaUserIds: alpha.map((member) => member.id),
			bravoUserIds: bravo.map((member) => member.id),
			isMatchmade,
		},
		{ isConcluded, isReported, createdAt },
	);

	return { matchId: match.id, alpha, bravo };
}
