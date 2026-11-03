import { DEV_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { befriend, createNamedUsers } from "./helpers/sidebar";
import { FeedPage } from "./pages/feed/feed-page";
import { FeedPostPage } from "./pages/feed/feed-post-page";

const FRIENDSHIP_POST = /Callie\s+and\s+Marie\s+are now friends/;

test.describe("Feed", () => {
	test("turning on the new home page shows the feed on the front page", async ({
		page,
		factories,
	}) => {
		await createFriendshipPost(factories);

		await impersonate(page);
		const feed = new FeedPage(page);
		await feed.enableAsHomePage();
		await feed.goto();

		await expect(feed.locators.heading).toBeVisible();
		await expect(feed.post(FRIENDSHIP_POST)).toBeVisible();
	});

	test("a comment and a reaction on a post are saved", async ({
		page,
		factories,
	}) => {
		await createFriendshipPost(factories);
		await factories.UserFactory.grant(ADMIN_ID, {
			preferences: { newHomePage: true },
		});

		await impersonate(page);
		const feed = new FeedPage(page);
		await feed.goto();
		const post = await feed.openPost(FRIENDSHIP_POST);

		await test.step("comments", async () => {
			await expect(post.locators.noCommentsText).toBeVisible();
			await post.comment("Congrats you two!");
			await post.reload();

			await expect(post.locators.comments).toHaveCount(1);
			await expect(post.locators.comments).toContainText("Congrats you two!");
		});

		await test.step("reacts and takes the reaction back", async () => {
			await post.toggleReaction();
			await post.reload();
			await expect(post.locators.reactButton).toHaveAttribute(
				"aria-pressed",
				"true",
			);
			await expect(post.locators.reactButton).toHaveText("1");

			await post.toggleReaction();
			await post.reload();
			await expect(post.locators.reactButton).toHaveAttribute(
				"aria-pressed",
				"false",
			);
		});
	});

	test("a share link shows the post to someone it isn't in the feed of", async ({
		page,
		factories,
	}) => {
		await createFriendshipPost(factories);
		await factories.UserFactory.createDev();
		await factories.UserFactory.grant(ADMIN_ID, {
			preferences: { newHomePage: true },
		});

		await impersonate(page);
		const feed = new FeedPage(page);
		await feed.goto();
		const shareLink = await (
			await feed.openPost(FRIENDSHIP_POST)
		).copyShareLink();

		await impersonate(page, DEV_TEST_ID);
		const post = new FeedPostPage(page);
		await post.gotoViaShareLink(shareLink);

		await expect(post.locators.post).toContainText(FRIENDSHIP_POST);
	});
});

/** Two friends of the admin becoming friends with each other, a post in the admin's feed. */
async function createFriendshipPost(factories: Factories) {
	const [callie, marie] = await createNamedUsers(factories, [
		"Callie",
		"Marie",
	]);

	await befriend(factories, [callie.id, marie.id], ADMIN_ID);
	await factories.FriendshipFactory.create({
		userOneId: callie.id,
		userTwoId: marie.id,
	});
}
