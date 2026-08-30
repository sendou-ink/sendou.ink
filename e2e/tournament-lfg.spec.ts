import { subDays } from "date-fns";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { TournamentSubsPage } from "./pages/tournament/tournament-subs-page";

const SUB_NAME = "Subby Sam";
const SUB_MESSAGE = "Free after 8pm";

test.describe("Tournament LFG", () => {
	test("player adds their own sub post and deletes it", async ({
		page,
		factories,
	}) => {
		// registration is closed (start time in the past) so the subs view is shown
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: [dateToDatabaseTimestamp(subDays(new Date(), 1))],
		});
		const sub = await factories.UserFactory.create({
			discordName: SUB_NAME,
		});

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
});
