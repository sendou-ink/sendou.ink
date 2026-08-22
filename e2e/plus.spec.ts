import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { lastCompletedVoting } from "~/features/plus-voting/core/voting-time";
import {
	PLUS_DOWNVOTE,
	PLUS_UPVOTE,
} from "~/features/plus-voting/plus-voting-constants";
import { PLUS_VOTING_PAGE } from "~/utils/urls";
import {
	expect,
	impersonate,
	isNotVisible,
	runRoutine,
	setPlusVotingActive,
	test,
} from "./helpers/playwright";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { NewSuggestionPage } from "./pages/plus/new-suggestion-page";
import { SuggestionCommentPage } from "./pages/plus/suggestion-comment-page";
import { PlusSuggestionsPage } from "./pages/plus/suggestions-page";
import { PlusVotingPage } from "./pages/plus/voting-page";
import { PlusVotingResultsPage } from "./pages/plus/voting-results-page";

const SUGGESTED_NAME = "SuggestedSue";
const SUGGESTED_DISCORD_ID = "1000000000000000001";
const FAILER_NAME = "FalterFred";
const FAILER_DISCORD_ID = "1000000000000000002";

const SUGGESTION_TEXT = "Great player and even better person";
const EDITED_SUGGESTION_TEXT = "Great player and an amazing person";
const FOLLOW_UP_COMMENT_TEXT = "Seconding, deserves the spot";

test.describe("Plus Server", () => {
	test("member suggests a user, members vote and results decide the memberships", async ({
		page,
		factories,
	}) => {
		await factories.UserFactory.grant(ADMIN_ID, { plusTier: 1 });
		await factories.UserFactory.grant(NZAP_TEST_ID, { plusTier: 1 });
		const suggested = await factories.UserFactory.create({
			discordName: SUGGESTED_NAME,
			discordId: SUGGESTED_DISCORD_ID,
			profile: null,
		});

		await impersonate(page);

		const suggestions = new PlusSuggestionsPage(page);
		await suggestions.goto();
		await expect(suggestions.locators.noSuggestions).toBeVisible();

		const newSuggestion = new NewSuggestionPage(page);
		await newSuggestion.goto();
		await expect(newSuggestion.locators.heading).toBeVisible();
		await newSuggestion.suggest({
			username: SUGGESTED_NAME,
			comment: SUGGESTION_TEXT,
		});

		await expect(suggestions.suggestedUser(SUGGESTED_NAME)).toBeVisible();
		await suggestions.openComments(1);
		await expect(suggestions.comment(SUGGESTION_TEXT)).toBeVisible();

		await suggestions.editComment(SUGGESTION_TEXT, EDITED_SUGGESTION_TEXT);
		await suggestions.openComments(1);
		await expect(suggestions.comment(EDITED_SUGGESTION_TEXT)).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);
		await suggestions.goto();
		await suggestions.locators.commentLink.click();

		const commentPage = new SuggestionCommentPage(page);
		await expect(
			commentPage.heading({ username: SUGGESTED_NAME, tier: 1 }),
		).toBeVisible();
		await commentPage.comment(FOLLOW_UP_COMMENT_TEXT);

		await suggestions.openComments(2);
		await expect(suggestions.comment(FOLLOW_UP_COMMENT_TEXT)).toBeVisible();

		await suggestions.deleteComment(FOLLOW_UP_COMMENT_TEXT);
		await expect(suggestions.commentsSummary(1)).toBeVisible();

		await setPlusVotingActive(page, true);
		await runRoutine(page, "NotifyPlusServerVoting");

		await suggestions.goto();
		const notifications = new NotificationPopover(page);
		await notifications.open();
		await notifications.openNotification("Plus Server voting of season");
		await expect(page).toHaveURL(PLUS_VOTING_PAGE);

		const voting = new PlusVotingPage(page);
		await expect(voting.locators.upvoteButton).toBeVisible();
		await voting.upvoteCurrent();
		await voting.upvoteCurrent();
		await voting.submitVotes();
		await expect(voting.locators.votedAlert).toBeVisible();

		await setPlusVotingActive(page, false);
		await voting.goto();
		await expect(voting.locators.votingStartsInfo).toBeVisible();

		await impersonate(page, suggested.id);
		await suggestions.goto();
		await notifications.open();
		await expect(
			notifications.notification("You were suggested to +1"),
		).toBeVisible();
		await notifications.close();

		await suggestions.deleteOwnSuggestion();
		await expect(suggestions.locators.noSuggestions).toBeVisible();

		const completedVoting = lastCompletedVoting(new Date());
		const failer = await factories.UserFactory.create({
			discordName: FAILER_NAME,
			discordId: FAILER_DISCORD_ID,
			profile: null,
		});
		await factories.PlusSuggestionFactory.create({
			authorId: ADMIN_ID,
			suggestedId: suggested.id,
			tier: 1,
			...completedVoting,
		});
		await factories.PlusVoteFactory.create({
			authorId: ADMIN_ID,
			votedId: NZAP_TEST_ID,
			score: PLUS_UPVOTE,
		});
		await factories.PlusVoteFactory.create({
			authorId: ADMIN_ID,
			votedId: suggested.id,
			score: PLUS_UPVOTE,
		});
		await factories.PlusVoteFactory.create({
			authorId: ADMIN_ID,
			votedId: failer.id,
			score: PLUS_DOWNVOTE,
		});
		await factories.PlusVoteFactory.syncTiers();

		const results = new PlusVotingResultsPage(page);
		await results.goto();
		await expect(results.locators.heading).toBeVisible();
		await expect(results.ownResult({ tier: 1, passed: true })).toBeVisible();
		await expect(results.passedHeading(2)).toBeVisible();
		await expect(results.failedHeading(1)).toBeVisible();
		await expect(results.userResult("N-ZAP")).toBeVisible();
		await expect(results.suggestedMarker(SUGGESTED_NAME)).toBeVisible();
		await expect(results.userResult(FAILER_NAME)).toBeVisible();

		const plusListResponse = await page.request.get("/plus/list", {
			headers: { "Lohi-Token": process.env.LOHI_TOKEN ?? "salmon" },
		});
		expect(plusListResponse.ok()).toBe(true);
		const plusList = (await plusListResponse.json()) as {
			users: Record<string, number>;
		};
		expect(plusList.users[SUGGESTED_DISCORD_ID]).toBe(1);
		// a non-suggested member who fails the vote drops one tier instead of out
		expect(plusList.users[FAILER_DISCORD_ID]).toBe(2);
	});

	test("user without a plus tier cannot suggest, comment or vote", async ({
		page,
		factories,
	}) => {
		await factories.UserFactory.grant(ADMIN_ID, { plusTier: 1 });
		const suggested = await factories.UserFactory.create({
			discordName: SUGGESTED_NAME,
			discordId: SUGGESTED_DISCORD_ID,
			profile: null,
		});
		await factories.PlusSuggestionFactory.create({
			authorId: ADMIN_ID,
			suggestedId: suggested.id,
			tier: 1,
			text: SUGGESTION_TEXT,
		});

		await impersonate(page, NZAP_TEST_ID);

		const suggestions = new PlusSuggestionsPage(page);
		await suggestions.goto();
		await expect(suggestions.suggestedUser(SUGGESTED_NAME)).toBeVisible();
		await isNotVisible(suggestions.locators.commentLink);

		const newSuggestion = new NewSuggestionPage(page);
		await newSuggestion.goto();
		await expect(suggestions.locators.noPermissionsAlert).toBeVisible();
		await isNotVisible(newSuggestion.locators.heading);

		const commentPage = new SuggestionCommentPage(page);
		await commentPage.goto({ tier: 1, userId: suggested.id });
		await expect(page).not.toHaveURL(/comment/);
		await isNotVisible(
			commentPage.heading({ username: SUGGESTED_NAME, tier: 1 }),
		);

		await setPlusVotingActive(page, true);

		const voting = new PlusVotingPage(page);
		await voting.goto();
		await expect(voting.locators.votingOngoingInfo).toBeVisible();
		await isNotVisible(voting.locators.upvoteButton);
	});
});
