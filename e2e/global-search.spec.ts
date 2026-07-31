import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import { tournamentOrganizationPage, userPage } from "~/utils/urls";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { GlobalSearchDialog } from "./pages/search/global-search-dialog";

const ORGANIZATION_NAME = "Sendou.ink";

test.describe("Global search", () => {
	test("searches for users and organizations", async ({ page, factories }) => {
		const org = await factories.TournamentOrganizationFactory.create({
			ownerId: ADMIN_ID,
			name: ORGANIZATION_NAME,
		});

		await impersonate(page);
		await navigate({ page, url: "/" });

		const search = new GlobalSearchDialog(page);

		await search.open();
		await search.selectType("users");
		await search.search("sendou");
		await search.selectOption("Sendou");
		await expect(page).toHaveURL(userPage({ discordId: ADMIN_DISCORD_ID }));

		await search.open();
		await search.selectType("organizations");
		await search.search("sendou");
		await search.selectOption(ORGANIZATION_NAME);
		await expect(page).toHaveURL(
			tournamentOrganizationPage({ organizationSlug: org.slug }),
		);
	});

	test("searches for weapons", async ({ page }) => {
		await impersonate(page);
		await navigate({ page, url: "/" });

		const search = new GlobalSearchDialog(page);

		await search.open();
		await search.selectType("weapons");
		await search.search("splattershot");
		await search.selectOption("Splattershot");
		await search.selectOption("Builds");
		await expect(page).toHaveURL(/\/builds\/splattershot/);
	});
});
