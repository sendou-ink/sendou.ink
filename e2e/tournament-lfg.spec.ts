import { addDays, addHours, subDays, subHours } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { openSecondUser } from "./helpers/chat";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import {
	createTeams,
	DOUBLE_ELIMINATION,
	ROSTER_SIZE,
	startedTournamentTimes,
	teamSeeds,
} from "./helpers/tournament";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentLookingPage } from "./pages/tournament/tournament-looking-page";
import { TournamentSubsPage } from "./pages/tournament/tournament-subs-page";

const SUB_NAME = "Subby Sam";
const SUB_MESSAGE = "Free after 8pm";
const NOT_STAYING_NAME = "Leaving Lee";
const GROUP_NOTE = "Looking for a backline";
const INVITER_NAME = "Inviting Ivy";
const INVITEE_NAME = "Invited Ian";
const SOLO_NAME = "Solo Sol";
const TEAM_NAME = "Looking Lobsters";
const FULL_TEAM_NAME = "Crowded Crabs";
const WEAPON_NAME = "Splattershot";
const SPLATTERSHOT_ID = 40;

test.describe("Tournament LFG", () => {
	/**
	 * A player without a team joins the queue as a group of their own, with a note and the choice to
	 * stay as sub, which they can change while in it. A registered team's owner puts the team in the
	 * queue to look for more members. Groups too big for the own group's free spots aren't shown.
	 * Cards show the members' voice chat, languages and weapons from their match profile, and the
	 * join form shows the player's own.
	 */
	test.describe("Queue", () => {
		test("a player joins the queue with a note and stops looking", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const player = await createNamedUser(factories, SOLO_NAME);

			await impersonate(page, player.id);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await looking.joinQueueForm.fill("note", GROUP_NOTE);
			await looking.joinQueueForm.submit();

			await expect(looking.ownGroupCard).toContainText(SOLO_NAME);
			await expect(looking.ownGroupCard).toContainText(GROUP_NOTE);

			await looking.stopLooking();

			await expect(looking.locators.lookForTeamButton).toBeVisible();
		});

		test("the join form shows the player's match profile", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const player = await createPlayerWithMatchProfile(factories, SOLO_NAME);

			await impersonate(page, player.id);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await expect(looking.locators.matchProfileSummary).toContainText(
				"Can VC",
			);
			await expect(looking.locators.matchProfileSummary).toContainText(
				"EN / DE",
			);
			await expect(looking.matchProfileWeapon(WEAPON_NAME)).toBeVisible();
		});

		test("a group's card shows its members' voice chat, languages and weapons", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const player = await createPlayerWithMatchProfile(factories, SOLO_NAME);
			await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: player.id,
			});

			await impersonate(page, NZAP_TEST_ID);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await expect(looking.weaponOf(SOLO_NAME, WEAPON_NAME)).toBeVisible();

			await looking.voiceChatButtonOf(SOLO_NAME, "Can voice chat").click();

			await expect(
				looking.visibleText("Can voice chat (English, Deutsch)"),
			).toBeVisible();
		});

		test("a player changes their sub preference without leaving the queue", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const sub = await createNamedUser(factories, SUB_NAME);

			await impersonate(page, sub.id);

			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await looking.joinQueueForm.submit();

			await expect(looking.locators.stayAsSubSwitch).not.toBeChecked();

			await looking.toggleStayAsSub();

			await looking.goto(tournament.id);
			await expect(looking.locators.stayAsSubSwitch).toBeChecked();
		});

		test("a registered team's owner puts the team in the queue to look for more members", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const [owner, teammate] = await factories.UserFactory.createMany(2);
			await factories.TournamentTeamFactory.create({
				tournamentId: tournament.id,
				team: teamNamed(TEAM_NAME),
				memberUserIds: [owner.id, teammate.id],
			});
			const player = await createNamedUser(factories, SOLO_NAME);
			const looking = new TournamentLookingPage(page);

			await test.step("The owner puts the team in the queue", async () => {
				await impersonate(page, owner.id);
				await looking.goto(tournament.id);
				await looking.lookForMoreMembers();

				await expect(looking.locators.stopLookingButton).toBeVisible();
				await isNotVisible(looking.locators.lookForMoreMembersButton);
			});

			await test.step("A player looking for a team sees it among the groups", async () => {
				await impersonate(page, player.id);
				await looking.goto(tournament.id);

				await expect(looking.groupOf(TEAM_NAME)).toBeVisible();
			});
		});

		test("groups too big for the own group's free spots aren't shown", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const [owner, teammate] = await factories.UserFactory.createMany(2);
			await createLookingTeam(factories, {
				tournamentId: tournament.id,
				name: TEAM_NAME,
				memberUserIds: [owner.id, teammate.id],
			});
			// 5 members, more than the 4 spots a team of 2 has left
			const fullTeamMembers = await factories.UserFactory.createMany(5);
			await createLookingTeam(factories, {
				tournamentId: tournament.id,
				name: FULL_TEAM_NAME,
				memberUserIds: fullTeamMembers.map((user) => user.id),
			});
			const player = await createNamedUser(factories, SOLO_NAME);
			await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: player.id,
			});

			await impersonate(page, owner.id);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await expect(looking.groupOf(SOLO_NAME)).toBeVisible();
			await isNotVisible(looking.groupOf(FULL_TEAM_NAME));
		});
	});

	/**
	 * Groups invite each other and can withdraw an invitation. The invited group is notified and
	 * accepting the invitation merges the two groups into one.
	 */
	test.describe("Invitations", () => {
		test("accepting an invitation merges the two groups", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const inviter = await createNamedUser(factories, INVITER_NAME);
			const invitee = await createNamedUser(factories, INVITEE_NAME);
			for (const userId of [inviter.id, invitee.id]) {
				await factories.TournamentLFGTeamFactory.create({
					tournamentId: tournament.id,
					userId,
				});
			}
			const looking = new TournamentLookingPage(page);

			await test.step("The inviter invites the invitee's group", async () => {
				await impersonate(page, inviter.id);
				await looking.goto(tournament.id);
				await looking.inviteGroupOf(INVITEE_NAME);

				await expect(looking.undoButtonOf(INVITEE_NAME)).toBeVisible();
			});

			await test.step("The invitee is notified and accepts the invitation", async () => {
				await impersonate(page, invitee.id);
				await navigate({ page, url: "/" });

				const notifications = new NotificationPopover(page);
				await notifications.open();
				await notifications.openNotification(
					`${INVITER_NAME} invited your group`,
				);
				await looking.acceptInvitationOf(INVITER_NAME);

				await expect(looking.ownGroupCard).toContainText(INVITER_NAME);
				await expect(looking.ownGroupCard).toContainText(INVITEE_NAME);
			});

			await test.step("The inviter is in the merged group too", async () => {
				await impersonate(page, inviter.id);
				await looking.goto(tournament.id);

				await expect(looking.ownGroupCard).toContainText(INVITEE_NAME);
			});
		});

		test("withdrawing an invitation offers the invite again", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const inviter = await createNamedUser(factories, INVITER_NAME);
			const invitee = await createNamedUser(factories, INVITEE_NAME);
			const inviteeGroup = await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: invitee.id,
			});
			await factories.TournamentLFGTeamFactory.create(
				{ tournamentId: tournament.id, userId: inviter.id },
				{ likedTeamIds: [inviteeGroup.id] },
			);

			await impersonate(page, inviter.id);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await looking.undoInvitationOf(INVITEE_NAME);

			await expect(looking.inviteButtonOf(INVITEE_NAME)).toBeVisible();
		});
	});

	/**
	 * The page stays current without a reload, the way the SendouQ looking page does: groups
	 * joining and leaving the queue, invitations given and withdrawn, and an accepted invitation
	 * merging the inviter's group show up for everyone viewing it.
	 */
	test.describe("Live updates", () => {
		test("a group joining and leaving the queue shows up for others without a reload", async ({
			page,
			browser,
			workerBaseURL,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const viewer = await createNamedUser(factories, INVITER_NAME);
			const joiner = await createNamedUser(factories, SOLO_NAME);

			await impersonate(page, viewer.id);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await isNotVisible(looking.groupOf(SOLO_NAME));

			const other = await openSecondUser(browser, workerBaseURL, joiner.id);
			try {
				const otherLooking = new TournamentLookingPage(other.page);
				await otherLooking.goto(tournament.id);

				await otherLooking.joinQueueForm.fill("note", GROUP_NOTE);
				await otherLooking.joinQueueForm.submit();
				await expect(otherLooking.ownGroupCard).toContainText(GROUP_NOTE);

				await expect(looking.groupOf(SOLO_NAME)).toContainText(GROUP_NOTE);

				await otherLooking.stopLooking();

				await isNotVisible(looking.groupOf(SOLO_NAME));
			} finally {
				await other.close();
			}
		});

		test("an invitation shows up for the invited group without a reload", async ({
			page,
			browser,
			workerBaseURL,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const inviter = await createNamedUser(factories, INVITER_NAME);
			const invitee = await createNamedUser(factories, INVITEE_NAME);
			for (const userId of [inviter.id, invitee.id]) {
				await factories.TournamentLFGTeamFactory.create({
					tournamentId: tournament.id,
					userId,
				});
			}

			await impersonate(page, invitee.id);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await expect(looking.inviteButtonOf(INVITER_NAME)).toBeVisible();

			const other = await openSecondUser(browser, workerBaseURL, inviter.id);
			try {
				const otherLooking = new TournamentLookingPage(other.page);
				await otherLooking.goto(tournament.id);

				await otherLooking.inviteGroupOf(INVITEE_NAME);

				await expect(looking.acceptButtonOf(INVITER_NAME)).toBeVisible();

				await otherLooking.undoInvitationOf(INVITEE_NAME);

				await expect(looking.inviteButtonOf(INVITER_NAME)).toBeVisible();
				await isNotVisible(looking.acceptButtonOf(INVITER_NAME));
			} finally {
				await other.close();
			}
		});

		test("accepting an invitation shows the merged group to the inviter without a reload", async ({
			page,
			browser,
			workerBaseURL,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const inviter = await createNamedUser(factories, INVITER_NAME);
			const invitee = await createNamedUser(factories, INVITEE_NAME);
			const inviteeGroup = await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: invitee.id,
			});
			await factories.TournamentLFGTeamFactory.create(
				{ tournamentId: tournament.id, userId: inviter.id },
				{ likedTeamIds: [inviteeGroup.id] },
			);

			await impersonate(page, inviter.id);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await expect(looking.undoButtonOf(INVITEE_NAME)).toBeVisible();

			const other = await openSecondUser(browser, workerBaseURL, invitee.id);
			try {
				const otherLooking = new TournamentLookingPage(other.page);
				await otherLooking.goto(tournament.id);

				await otherLooking.acceptInvitationOf(INVITER_NAME);

				await expect(looking.ownGroupCard).toContainText(INVITEE_NAME);
			} finally {
				await other.close();
			}
		});
	});

	/**
	 * Once registration has closed the page lists sub posts instead. A player not on a team posts
	 * themselves once, with a message, and can delete the post. Once the tournament starts the
	 * players who chose to stay as sub are listed, the rest of the queue isn't. A sub post shows the
	 * player's voice chat, languages and weapons from their match profile.
	 */
	test.describe("Subs", () => {
		test("a player posts themselves as a sub once and deletes the post", async ({
			page,
			factories,
		}) => {
			const tournament = await createClosedTournament(factories);
			const sub = await createNamedUser(factories, SUB_NAME);

			await impersonate(page, sub.id);

			const subs = new TournamentSubsPage(page);
			await subs.goto(tournament.id);

			await expect(subs.locators.noPostsText).toBeVisible();

			await subs.openAddPostDialog();
			await expect(subs.locators.addPostDialogHeading).toBeVisible();

			await subs.addSubForm.fill("message", SUB_MESSAGE);
			await subs.addSubForm.submit();

			await expect(subs.subPostText(SUB_NAME)).toBeVisible();
			await expect(subs.subPostText(SUB_MESSAGE)).toBeVisible();
			// a second post by the same user is not offered
			await isNotVisible(subs.locators.addPostButton);

			await subs.deleteOwnPost();

			await expect(subs.locators.noPostsText).toBeVisible();
			await expect(subs.locators.addPostButton).toBeVisible();
		});

		test("a sub post shows the player's voice chat, languages and weapons", async ({
			page,
			factories,
		}) => {
			const tournament = await createClosedTournament(factories);
			const sub = await createPlayerWithMatchProfile(factories, SUB_NAME);
			await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: sub.id,
				isStayAsSub: true,
			});

			await impersonate(page, NZAP_TEST_ID);
			const subs = new TournamentSubsPage(page);
			await subs.goto(tournament.id);

			await expect(subs.subPostText("Can VC")).toBeVisible();
			await expect(subs.subPostText("EN / DE")).toBeVisible();
			await expect(subs.weaponImage(WEAPON_NAME)).toBeVisible();
		});

		test("players who chose to stay as sub are listed once the tournament starts and can replace their post", async ({
			page,
			factories,
		}) => {
			const tournament = await factories.TournamentFactory.create({
				authorId: ADMIN_ID,
				startTimes: startedTournamentTimes(),
			});
			await createTeams(factories, tournament.id, teamSeeds(2));

			const stayingSub = await createNamedUser(factories, SUB_NAME);
			const notStayingPlayer = await createNamedUser(
				factories,
				NOT_STAYING_NAME,
			);
			await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: stayingSub.id,
				isStayAsSub: true,
			});
			await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: notStayingPlayer.id,
				isStayAsSub: false,
			});

			await factories.TournamentFactory.startBracket(tournament.id);

			await impersonate(page, stayingSub.id);

			const subs = new TournamentSubsPage(page);
			await subs.goto(tournament.id);

			await expect(subs.subPostText(SUB_NAME)).toBeVisible();
			await isNotVisible(subs.subPostText(NOT_STAYING_NAME));

			await subs.deleteOwnPost();

			await expect(subs.locators.noPostsText).toBeVisible();

			await subs.openAddPostDialog();
			await subs.addSubForm.fill("message", SUB_MESSAGE);
			await subs.addSubForm.submit();

			await expect(subs.subPostText(SUB_NAME)).toBeVisible();
			await expect(subs.subPostText(SUB_MESSAGE)).toBeVisible();
		});
	});

	/**
	 * Organizers of the tournament take other groups out of the queue and add sub posts for users
	 * from the admin page: also once players can't add their own, as registration closed before the
	 * start, and for a player whose team dropped out.
	 */
	test.describe("Organizer", () => {
		test("an organizer removes a group from the queue", async ({
			page,
			factories,
		}) => {
			const tournament = await createOpenTournament(factories);
			const player = await createNamedUser(factories, SOLO_NAME);
			await factories.TournamentLFGTeamFactory.create({
				tournamentId: tournament.id,
				userId: player.id,
			});

			await impersonate(page, ADMIN_ID);
			const looking = new TournamentLookingPage(page);
			await looking.goto(tournament.id);

			await looking.removeGroupOf(SOLO_NAME);

			await isNotVisible(looking.groupOf(SOLO_NAME));
		});

		test("an organizer adds a sub post for a user from the admin page", async ({
			page,
			factories,
		}) => {
			const tournament = await createClosedTournament(factories);
			await createNamedUser(factories, SUB_NAME);

			await impersonate(page, ADMIN_ID);
			const admin = new TournamentAdminPage(page);
			await admin.goto(tournament.id);

			await admin.openAddSubDialog();
			await admin.addSubForm.selectUser("userId", SUB_NAME);
			await admin.addSubForm.fill("message", SUB_MESSAGE);
			await admin.addSubForm.submit();

			await expect(admin.locators.addSubDialogHeading).toHaveCount(0);

			const subs = new TournamentSubsPage(page);
			await subs.goto(tournament.id);
			await expect(subs.subPostText(SUB_NAME)).toBeVisible();
			await expect(subs.subPostText(SUB_MESSAGE)).toBeVisible();
		});

		test("an organizer adds a sub post for a player who can't add their own after registration closed early", async ({
			page,
			factories,
		}) => {
			const startsAt = addHours(new Date(), 1);
			const tournament = await factories.TournamentFactory.create({
				authorId: ADMIN_ID,
				startTimes: [dateToDatabaseTimestamp(startsAt)],
				regClosesAt: dateToDatabaseTimestamp(subHours(new Date(), 1)),
			});
			const sub = await createNamedUser(factories, SUB_NAME);
			const subs = new TournamentSubsPage(page);

			await test.step("The player isn't offered to add themselves as a sub", async () => {
				await impersonate(page, sub.id);
				await subs.goto(tournament.id);

				await expect(subs.locators.noPostsText).toBeVisible();
				await isNotVisible(subs.locators.addPostButton);
			});

			await test.step("Sendou adds them from the admin page", async () => {
				await impersonate(page, ADMIN_ID);
				const admin = new TournamentAdminPage(page);
				await admin.goto(tournament.id);

				await admin.openAddSubDialog();
				await admin.addSubForm.selectUser("userId", SUB_NAME);
				await admin.addSubForm.submit();

				await expect(admin.locators.addSubDialogHeading).toHaveCount(0);
			});

			await test.step("The player's sub post is listed", async () => {
				await impersonate(page, sub.id);
				await subs.goto(tournament.id);

				await expect(subs.subPostText(SUB_NAME)).toBeVisible();
			});
		});

		test("an organizer adds a sub post for a user whose team dropped out", async ({
			page,
			factories,
		}) => {
			const tournament = await factories.TournamentFactory.create({
				authorId: ADMIN_ID,
				startTimes: startedTournamentTimes(),
				bracketProgression: DOUBLE_ELIMINATION,
			});
			const dropout = await createNamedUser(factories, NOT_STAYING_NAME);
			const teammates = await factories.UserFactory.createMany(ROSTER_SIZE - 1);
			await factories.TournamentTeamFactory.create(
				{
					tournamentId: tournament.id,
					team: teamNamed(TEAM_NAME),
					memberUserIds: [dropout.id, ...teammates.map((user) => user.id)],
				},
				// the team was recruiting on the LFG page before it dropped out
				{ isCheckedIn: true, isLooking: true },
			);
			// enough opponents that dropping out one team does not end every match
			await createTeams(factories, tournament.id, teamSeeds(3));
			await factories.TournamentFactory.startBracket(tournament.id);

			await impersonate(page, ADMIN_ID);
			const admin = new TournamentAdminPage(page);
			await admin.goto(tournament.id);

			await admin.searchTeams(TEAM_NAME);
			await admin.dropOutTeam(0);

			await admin.openAddSubDialog();
			await admin.addSubForm.selectUser("userId", NOT_STAYING_NAME);
			await admin.addSubForm.fill("message", SUB_MESSAGE);
			await admin.addSubForm.submit();

			await expect(admin.locators.addSubDialogHeading).toHaveCount(0);

			const subs = new TournamentSubsPage(page);
			await subs.goto(tournament.id);
			await expect(subs.subPostText(NOT_STAYING_NAME)).toBeVisible();
			await expect(subs.subPostText(SUB_MESSAGE)).toBeVisible();
		});
	});
});

/** A tournament of Sendou's starting tomorrow, so registration is open and the page shows the queue. */
function createOpenTournament(factories: Factories) {
	return factories.TournamentFactory.create({
		authorId: ADMIN_ID,
		startTimes: [dateToDatabaseTimestamp(addDays(new Date(), 1))],
	});
}

/** A tournament of Sendou's that started yesterday, so registration is closed and the page lists subs. */
function createClosedTournament(factories: Factories) {
	return factories.TournamentFactory.create({
		authorId: ADMIN_ID,
		startTimes: [dateToDatabaseTimestamp(subDays(new Date(), 1))],
	});
}

/** A user who can voice chat in English and German and plays Splattershot. */
function createPlayerWithMatchProfile(factories: Factories, name: string) {
	return factories.UserFactory.create(
		{ discordName: name },
		{
			matchProfile: {
				vc: "YES",
				languages: ["en", "de"],
				weaponPool: [{ id: SPLATTERSHOT_ID, isFavorite: true }],
			},
		},
	);
}

/** A user shown on the page by the name given to them. */
function createNamedUser(factories: Factories, name: string) {
	return factories.UserFactory.create({ discordName: name });
}

function teamNamed(name: string) {
	return { name, prefersNotToHost: 0 as const, teamId: null };
}

/** A registered team in the queue, looking for more members. */
function createLookingTeam(
	factories: Factories,
	{
		tournamentId,
		name,
		memberUserIds,
	}: { tournamentId: number; name: string; memberUserIds: number[] },
) {
	return factories.TournamentTeamFactory.create(
		{ tournamentId, team: teamNamed(name), memberUserIds },
		{ isLooking: true },
	);
}
