import { addDays, subDays } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import { TROPHY_APPROVALS_REQUIRED } from "~/features/trophies/trophies-constants";
import { decompressFromBase64 } from "~/utils/compression";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { TROPHIES_PAGE } from "~/utils/urls";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { NewTrophyPage } from "./pages/trophies/new-trophy-page";
import { TrophiesPage } from "./pages/trophies/trophies-page";
import { UserPage } from "./pages/user/user-page";

const TROPHY_NAME = "Wellstring Wednesday";
const ORGANIZATION_NAME = "Sendou's Tournaments";
const TEAM_COUNT = 4;
const ROSTER_SIZE = 4;
/** Within the window a trophy's next tournament is highlighted for. */
const UPCOMING_IN_DAYS = 10;

test.describe("Trophies", () => {
	test("hides trophies from users without early access", async ({
		page,
		factories,
	}) => {
		await factories.TrophyFactory.create({ name: TROPHY_NAME });

		await impersonate(page, NZAP_TEST_ID);

		const response = await page.goto(TROPHIES_PAGE);
		expect(response?.status()).toBe(404);

		const userPage = new UserPage(page);
		await userPage.goto(ADMIN_DISCORD_ID);
		await isNotVisible(page.getByTestId("trophy-display"));

		// remove once feature is released
		const newTrophy = new NewTrophyPage(page);
		await newTrophy.goto();
		await expect(newTrophy.locators.agreeToTermsButton).toBeVisible();
	});

	test("shows trophy wins via user page trophy display", async ({
		page,
		factories,
	}) => {
		test.slow();

		const trophy = await factories.TrophyFactory.create({ name: TROPHY_NAME });
		const tournament = await playTrophyTournament(factories, trophy.id);

		await impersonate(page);

		const userPage = new UserPage(page);
		await userPage.goto(ADMIN_DISCORD_ID);

		const display = page.getByTestId("trophy-display");
		await expect(display).toBeVisible();
		await display.getByRole("button", { name: TROPHY_NAME }).click();

		await expect(page.getByText("View trophy page")).toBeVisible();
		await expect(
			page.getByRole("dialog").locator(`a[href^='/to/${tournament.id}']`),
		).toBeVisible();
	});

	test("browses trophy details from the trophies list", async ({
		page,
		factories,
	}) => {
		test.slow();

		// the trophy's series, so that the next edition of it shows a tentative tier
		const organization = await factories.TournamentOrganizationFactory.create(
			{ name: ORGANIZATION_NAME, ownerId: ADMIN_ID },
			{
				series: [
					{ name: TROPHY_NAME, description: null, showLeaderboard: false },
				],
			},
		);

		const trophy = await factories.TrophyFactory.create({ name: TROPHY_NAME });
		const otherTrophy = await factories.TrophyFactory.create({
			name: "Chris P. Bacon",
		});

		await playTrophyTournament(factories, trophy.id, organization.id);
		const upcoming = await factories.TournamentFactory.create({
			name: `${TROPHY_NAME} 2`,
			authorId: ADMIN_ID,
			organizationId: organization.id,
			startTimes: [
				dateToDatabaseTimestamp(addDays(new Date(), UPCOMING_IN_DAYS)),
			],
			trophyId: trophy.id,
		});

		await impersonate(page);

		const trophies = new TrophiesPage(page);
		await trophies.goto();
		expect(await trophies.locators.trophyLinks.count()).toBeGreaterThan(1);

		await trophies.search("Chris P");
		await expect(trophies.locators.trophyLinks).toHaveCount(1);

		const details = await trophies.openFirst();
		await expect(page).toHaveURL(`/trophies/${otherTrophy.id}`);
		await expect(details.locators.ownersHeading).toBeVisible();

		await trophies.search("Wellstring");
		await expect(trophies.tentativeTier(trophy.id)).toBeVisible();
		await expect(trophies.upcomingPill(trophy.id)).toBeVisible();

		await trophies.tile(trophy.id).click();
		await expect(details.locators.ownerLinks.first()).toBeVisible();

		const upcomingRow = details.tournamentRow(upcoming.id);
		await expect(upcomingRow.getByText("Upcoming")).toBeVisible();
		await expect(
			upcomingRow.getByText(`in ${UPCOMING_IN_DAYS} days`),
		).toBeVisible();
	});

	test("submits a new trophy after agreeing to terms", async ({
		page,
		factories,
	}) => {
		await factories.TournamentOrganizationFactory.create({
			name: ORGANIZATION_NAME,
			ownerId: ADMIN_ID,
		});

		await impersonate(page);

		const newTrophy = new NewTrophyPage(page);
		await newTrophy.goto();

		await isNotVisible(newTrophy.locators.nameInput);
		await newTrophy.agreeToTerms();

		await newTrophy.fillForm({
			name: "E2E Test Trophy",
			organizationName: ORGANIZATION_NAME,
			model: decompressFromBase64(factories.TrophyFactory.MODELS[0]) ?? "",
		});
		await newTrophy.save();

		const pending = await newTrophy.openPending();
		await expect(pending.row("E2E Test Trophy")).toBeVisible();
	});

	test("reviews pending trophies", async ({ page, factories }) => {
		const organization = await factories.TournamentOrganizationFactory.create({
			name: ORGANIZATION_NAME,
			ownerId: NZAP_TEST_ID,
		});

		const approvedName = "Approved Trophy";
		const declinedName = "Declined Trophy";
		for (const name of [approvedName, declinedName]) {
			await factories.TrophyFactory.createPending({
				name,
				organizationId: organization.id,
				submitterUserId: NZAP_TEST_ID,
			});
			await factories.NotificationFactory.create({
				notification: {
					type: "TROPHY_SUBMITTED",
					meta: { trophyName: name, submitterUsername: "N-ZAP" },
				},
				users: [{ userId: ADMIN_ID }],
			});
		}

		await impersonate(page);

		const newTrophy = new NewTrophyPage(page);
		await newTrophy.goto();

		const pending = await newTrophy.openPending();

		const notifications = new NotificationPopover(page);
		await expect(notifications.locators.bellDot).toBeVisible();

		await pending.approve(approvedName);
		await expect(
			pending
				.row(approvedName)
				.getByText(`1/${TROPHY_APPROVALS_REQUIRED} approvals`),
		).toBeVisible();

		// approving resolved that submission's notification, but the other
		// submission still waits for a review
		await expect(notifications.locators.bellDot).toBeVisible();

		await pending.decline(declinedName, "Does not meet the requirements");
		await isNotVisible(pending.row(declinedName));

		// with the last pending submission reviewed nothing needs attention anymore
		await expect(notifications.locators.bellDot).toBeHidden();

		const reviewed = await newTrophy.openReviewed();
		await expect(reviewed.row(declinedName)).toBeVisible();
		await expect(
			reviewed.row(declinedName).getByText("Declined by Sendou"),
		).toBeVisible();

		// declining notified the submitter
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await notifications.open();

		await expect(
			notifications.notification(`Your trophy ${declinedName} was declined`),
		).toBeVisible();
	});
});

/** Plays a tournament with the trophy as its prize, awarding it to the winning team. */
async function playTrophyTournament(
	factories: Factories,
	trophyId: number,
	organizationId?: number,
) {
	// the top seed wins, so the anchor users are on it and end up owning the trophy
	const players = await factories.UserFactory.createMany(
		TEAM_COUNT * ROSTER_SIZE - 2,
	);
	const ids = [ADMIN_ID, NZAP_TEST_ID, ...players.map((player) => player.id)];
	const teamRosters = Array.from({ length: TEAM_COUNT }, (_, i) =>
		ids.slice(i * ROSTER_SIZE, (i + 1) * ROSTER_SIZE),
	);

	return factories.TournamentFactory.createPlayed(
		{
			name: `${TROPHY_NAME} 1`,
			authorId: ADMIN_ID,
			organizationId,
			startTimes: [dateToDatabaseTimestamp(subDays(new Date(), 21))],
			trophyId,
		},
		{ teamRosters, playedOut: "all", tier: 3 },
	);
}
