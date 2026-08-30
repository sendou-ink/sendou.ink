import { addHours, addMinutes } from "date-fns";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as Availability from "~/features/availability/core/Availability";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	expect,
	impersonate,
	isNotVisible,
	MACHINE_TIMEZONE,
	navigate,
	setTimezoneCookie,
	test,
} from "./helpers/playwright";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentPage } from "./pages/tournament/tournament-page";
import { TournamentRegisterPage } from "./pages/tournament/tournament-register-page";
import { TournamentSeedsPage } from "./pages/tournament/tournament-seeds-page";
import { TournamentTeamsPage } from "./pages/tournament/tournament-teams-page";

const TEAM_NAME = "Chimera";
const ROSTER_SIZE = 4;
const SEEDED_TEAM_COUNT = 8;
const HOUR_SECONDS = 60 * 60;

/** Views of a tournament whose loaders each ship some of its teams' data. */
const TOURNAMENT_TEAM_VIEWS = ["teams", "results", "brackets", "admin/seeds"];

test.describe("Tournament", () => {
	test("registers for tournament", async ({ page, factories }) => {
		const [captain, ...friends] =
			await factories.UserFactory.createMany(ROSTER_SIZE);
		for (const friend of friends) {
			await factories.FriendshipFactory.create({
				userOneId: captain.id,
				userTwoId: friend.id,
			});
		}

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
			// teams pick their own counterpick maps
			mapPickingStyle: "AUTO_ALL",
		});

		await impersonate(page, captain.id);

		const tournamentPage = new TournamentPage(page);
		await tournamentPage.goto(tournament.id);

		const register = await tournamentPage.register();

		await register.form.fill("pickUpName", TEAM_NAME);
		await register.form.submit();

		await expect(register.member(1)).toBeVisible();

		for (let memberNumber = 2; memberNumber <= ROSTER_SIZE; memberNumber++) {
			await register.addPlayer();
			await expect(register.member(memberNumber)).toBeVisible();
		}

		await register.pickCounterpickMaps();
		await register.saveCounterpickMaps();

		await expect(register.stepCheckmark(3)).toBeVisible();

		// adding to the roster notified the added member
		await impersonate(page, friends[0].id);
		await navigate({ page, url: "/" });

		const notifications = new NotificationPopover(page);
		await notifications.open();

		await expect(
			notifications.notification(`Added to a team (${TEAM_NAME})`),
		).toBeVisible();
	});

	test("shows the estimated end time next to the start time", async ({
		page,
		factories,
	}) => {
		const startsAt = dateToDatabaseTimestamp(addHours(new Date(), 2));
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [startsAt],
		});

		const tournamentPage = new TournamentPage(page);
		await tournamentPage.goto(tournament.id);

		// a lone single elimination bracket is the estimator's two hour case
		await expect(tournamentPage.locators.estimatedEnd).toHaveAttribute(
			"datetime",
			databaseTimestampToDate(startsAt + 2 * HOUR_SECONDS).toISOString(),
		);
	});

	test("quick adds all of the team's players at once", async ({
		page,
		factories,
	}) => {
		const [captain, slayer, support, coach] =
			await factories.UserFactory.createMany(4);
		const team = await factories.TeamFactory.create(
			{ memberUserIds: [captain.id, slayer.id, support.id, coach.id] },
			{
				roles: {
					[slayer.id]: "SLAYER",
					[support.id]: "SUPPORT",
					[coach.id]: "COACH",
				},
			},
		);

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});

		await impersonate(page, captain.id);
		const tournamentPage = new TournamentPage(page);
		await tournamentPage.goto(tournament.id);

		const register = await tournamentPage.register();
		await register.form.fill("pickUpName", TEAM_NAME);
		await register.form.submit();
		await expect(register.member(1)).toBeVisible();

		// teammates are offered in the quick add, grouped under the team
		await register.openQuickAdd();
		await expect(register.availabilityRow(slayer.id)).toBeVisible();
		await expect(register.availabilityRow(coach.id)).toBeVisible();
		await page.keyboard.press("Escape");

		await register.addAllTeamPlayers(team.id);

		await expect(register.member(2)).toBeVisible();
		await expect(register.member(3)).toBeVisible();
		// the coach is not part of the competitive lineup
		await isNotVisible(register.member(4));
	});

	test("shows the roster's availability for the event window", async ({
		page,
		factories,
	}) => {
		const [captain, partialMember, unknownMember, stranger, friend] =
			await factories.UserFactory.createMany(5);
		await factories.TeamFactory.create({
			memberUserIds: [captain.id, partialMember.id, unknownMember.id],
		});
		await factories.FriendshipFactory.create({
			userOneId: captain.id,
			userTwoId: friend.id,
		});

		const startsAt = addHours(new Date(), 2);
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(startsAt)],
		});
		await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [
				captain.id,
				partialMember.id,
				unknownMember.id,
				stranger.id,
			],
		});

		const { startsAt: weekStartsAt } = Availability.weekRange(
			startsAt,
			MACHINE_TIMEZONE,
		);
		const coveringSlot = {
			startsAt: dateToDatabaseTimestamp(startsAt),
			endsAt: dateToDatabaseTimestamp(addHours(startsAt, 5)),
		};
		for (const userId of [captain.id, friend.id]) {
			await factories.AvailabilityWeekFactory.create({
				userId,
				weekStartsAt,
				timezone: MACHINE_TIMEZONE,
				slots: [coveringSlot],
			});
		}
		await factories.AvailabilityWeekFactory.create({
			userId: partialMember.id,
			weekStartsAt,
			timezone: MACHINE_TIMEZONE,
			slots: [
				{
					startsAt: dateToDatabaseTimestamp(addHours(startsAt, 1)),
					endsAt: coveringSlot.endsAt,
				},
			],
		});

		await impersonate(page, captain.id);
		await setTimezoneCookie(page);
		const register = new TournamentRegisterPage(page);
		await register.goto(tournament.id);

		const row = (userId: number) => register.availabilityRow(userId);
		await expect(row(captain.id)).toHaveAttribute("data-status", "available");
		await expect(row(partialMember.id)).toHaveAttribute(
			"data-status",
			"partial",
		);
		await expect(row(unknownMember.id)).toHaveAttribute(
			"data-status",
			"unknown",
		);
		// on the tournament roster without being a teammate or a friend, so
		// their schedule is not the viewer's to see
		await expect(row(stranger.id)).toHaveAttribute("data-status", "hidden");
		// the friend with an overlapping submitted range is offered in quick add
		await register.openQuickAdd();
		await expect(row(friend.id)).toHaveAttribute("data-status", "available");
	});

	test("registers a two player roster for a 2v2 tournament that takes no third member", async ({
		page,
		factories,
	}) => {
		const [captain, ...friends] = await factories.UserFactory.createMany(3);
		for (const friend of friends) {
			await factories.FriendshipFactory.create({
				userOneId: captain.id,
				userTwoId: friend.id,
			});
		}

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			// check-in opens an hour before the tournament starts
			startTimes: [dateToDatabaseTimestamp(addMinutes(new Date(), 30))],
			minMembersPerTeam: 2,
		});
		// the bracket preview needs an opponent to have anything to show
		const opponents = await factories.UserFactory.createMany(2);
		await factories.TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				team: pickUpTeam("Opponent"),
				memberUserIds: opponents.map((user) => user.id),
			},
			{ isCheckedIn: true },
		);

		await impersonate(page, captain.id);

		const tournamentPage = new TournamentPage(page);
		await tournamentPage.goto(tournament.id);

		const register = await tournamentPage.register();

		await register.form.fill("pickUpName", TEAM_NAME);
		await register.form.submit();

		await expect(register.member(1)).toBeVisible();
		await expect(register.noSubsFooter("2v2")).toBeVisible();

		await register.addPlayer();
		await expect(register.member(2)).toBeVisible();

		// a 2v2 roster is full at two: no room for the second friend or anyone
		// coming in through the invite link
		await isNotVisible(register.locators.addPlayerButton);
		await isNotVisible(register.locators.copyInviteLinkButton);

		await register.checkIn();

		const brackets = await register.openBrackets();
		await expect(brackets.teamName(TEAM_NAME).first()).toBeVisible();
	});

	test("checks in and appears on the bracket", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			// check-in opens an hour before the tournament starts
			startTimes: [dateToDatabaseTimestamp(addMinutes(new Date(), 30))],
		});

		const roster = await factories.UserFactory.createMany(ROSTER_SIZE);
		await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: pickUpTeam(TEAM_NAME),
			memberUserIds: roster.map((user) => user.id),
		});
		await factories.NotificationFactory.create({
			notification: {
				type: "TO_CHECK_IN_OPENED",
				meta: { tournamentId: tournament.id, tournamentName: "In The Zone" },
			},
			users: roster.map((user) => ({ userId: user.id })),
		});

		const opponents = await factories.UserFactory.createMany(2);
		for (const [i, opponent] of opponents.entries()) {
			await factories.TournamentTeamFactory.create(
				{
					tournamentId: tournament.id,
					team: pickUpTeam(`Opponent ${i + 1}`),
					memberUserIds: [opponent.id],
				},
				{ isCheckedIn: true },
			);
		}

		await impersonate(page, roster[0].id);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		await isNotVisible(brackets.teamName(TEAM_NAME));

		const register = new TournamentRegisterPage(page);
		await register.goto(tournament.id);

		const notifications = new NotificationPopover(page);
		await expect(notifications.locators.bellDot).toBeVisible();

		await register.checkIn();

		// checking in resolved the check-in notification without the bell
		// having been opened
		await expect(notifications.locators.bellDot).toBeHidden();

		const bracketsAfterCheckIn = await register.openBrackets();

		await expect(bracketsAfterCheckIn.locators.bracketsViewer).toBeVisible();
		await expect(
			bracketsAfterCheckIn.teamName(TEAM_NAME).first(),
		).toBeVisible();
	});

	test("adjusts seeds", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});

		const captains = await factories.UserFactory.createMany(SEEDED_TEAM_COUNT);
		const teams = [];
		for (const [i, captain] of captains.entries()) {
			teams.push(
				await factories.TournamentTeamFactory.create({
					tournamentId: tournament.id,
					team: pickUpTeam(teamNameForSeed(i + 1)),
					memberUserIds: [captain.id],
				}),
			);
		}

		await impersonate(page);

		const seeds = new TournamentSeedsPage(page);
		await seeds.goto(tournament.id);

		await seeds.dragTeamDown(teams[0].id);
		await seeds.save();

		const teamsPage = new TournamentTeamsPage(page);
		await teamsPage.goto(tournament.id);

		await expect(teamsPage.locators.teamNames.first()).not.toHaveText(
			teamNameForSeed(1),
		);
	});

	test("hides a draft tournament from non-organizers, including its loaders", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			isDraft: true,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});
		const captain = await factories.UserFactory.create();
		const team = await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: pickUpTeam(TEAM_NAME),
			memberUserIds: [captain.id],
		});

		// the draft's own pages never render, so flush the factory writes elsewhere
		await navigate({ page, url: "/" });

		for (const view of [...TOURNAMENT_TEAM_VIEWS, `teams/${team.id}`]) {
			const url = `/to/${tournament.id}/${view}`;

			const pageResponse = await page.request.fetch(url);
			expect(pageResponse.status(), `${url} page`).toBe(404);

			// each view's loader is also reachable on its own via single fetch
			const dataResponse = await page.request.fetch(`${url}.data`);
			expect(await dataResponse.text(), `${url}.data`).not.toContain(TEAM_NAME);
		}

		const scopedToTeamsLoader = await page.request.fetch(
			`/to/${tournament.id}/teams.data?_routes=features/tournament/routes/to.$id.teams`,
		);
		expect(await scopedToTeamsLoader.text()).not.toContain(TEAM_NAME);
	});
});

function pickUpTeam(name: string) {
	return { name, prefersNotToHost: 0 as const, teamId: null };
}

function teamNameForSeed(seed: number) {
	return `Team ${seed}`;
}
