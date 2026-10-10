import { NZAP_TEST_ID } from "~/db/seed/constants";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import { openSecondUser } from "./helpers/chat";
import {
	expect,
	expectNoErrorPage,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import { AdminActionsPage } from "./pages/admin/admin-actions-page";
import { DiscordAuthorizeInterceptor } from "./pages/auth/discord-authorize";
import { LogInLinkPage } from "./pages/auth/log-in-link-page";
import { FrontPage } from "./pages/front-page/front-page";
import { ErrorPage } from "./pages/layout/error-page";
import { SideNav } from "./pages/layout/side-nav";
import { SettingsPage } from "./pages/settings/settings-page";

const SESSION_COOKIE_NAME = "__session";
const KEEPER = { discordId: "323456789012345678", discordName: "KeeperUser" };
const LEAVER = { discordId: "423456789012345678", discordName: "LeaverUser" };

test.describe("Auth", () => {
	test("logs in via a log in link and logs out from the settings page", async ({
		page,
		factories,
	}) => {
		const logInLink = await factories.LogInLinkFactory.create({
			userId: NZAP_TEST_ID,
		});

		const logInLinkPage = new LogInLinkPage(page);
		const sideNav = new SideNav(page);

		await logInLinkPage.goto(logInLink.code);
		await expect(page).toHaveURL("/");
		await expect(sideNav.locators.footerUsername).toHaveText("N-ZAP");
		await isNotVisible(sideNav.locators.logInButton);

		const settings = new SettingsPage(page);
		await settings.goto();
		await settings.logOut();

		await expect(sideNav.locators.logInButton).toBeVisible();
		await isNotVisible(sideNav.locators.footerUsername);

		const errorPage = new ErrorPage(page);

		await navigate({ page, url: NOTIFICATIONS_URL });
		await expect(errorPage.heading("Authentication required")).toBeVisible();

		// the first log in consumed the single use link
		const reusedLink = await logInLinkPage.fetchResponse(logInLink.code);
		expect(reusedLink.status).toBe(400);
	});

	test("a session of an account deleted by a migration falls back to logged out", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const keeper = await factories.UserFactory.create(KEEPER);
		const leaver = await factories.UserFactory.create(LEAVER);
		const leaverLogInLink = await factories.LogInLinkFactory.create({
			userId: leaver.id,
		});
		const keeperLogInLink = await factories.LogInLinkFactory.create({
			userId: keeper.id,
		});

		const logInLinkPage = new LogInLinkPage(page);
		const sideNav = new SideNav(page);

		await logInLinkPage.goto(leaverLogInLink.code);
		await expect(sideNav.locators.footerUsername).toHaveText(
			LEAVER.discordName,
		);

		const admin = await openSecondUser(browser, workerBaseURL);
		const adminActions = new AdminActionsPage(admin.page);
		await adminActions.goto();
		await adminActions.migrateUser({
			oldUserName: KEEPER.discordName,
			newUserName: LEAVER.discordName,
		});
		await admin.close();

		const sessionCookie = async () =>
			(await page.context().cookies()).find(
				(cookie) => cookie.name === SESSION_COOKIE_NAME,
			);
		const staleCookie = await sessionCookie();
		expect(staleCookie).toBeDefined();

		await navigate({ page, url: "/" });
		await expectNoErrorPage(page);
		await expect(sideNav.locators.logInButton).toBeVisible();
		await isNotVisible(sideNav.locators.footerUsername);
		expect(await sessionCookie()).toBeUndefined();

		const errorPage = new ErrorPage(page);
		await navigate({ page, url: NOTIFICATIONS_URL });
		await expect(errorPage.heading("Authentication required")).toBeVisible();

		await page.context().addCookies([staleCookie!]);
		await logInLinkPage.goto(keeperLogInLink.code);
		await expect(sideNav.locators.footerUsername).toHaveText(
			KEEPER.discordName,
		);
	});

	test("log in button starts the Discord OAuth flow", async ({
		page,
		context,
	}) => {
		const discord = new DiscordAuthorizeInterceptor();
		await discord.install(context);

		const frontPage = new FrontPage(page);
		await frontPage.goto();

		const sideNav = new SideNav(page);
		await sideNav.locators.logInButton.click();

		await discord.waitForCapture();
		expect(discord.authorizeUrl.href).toMatch(
			/discord\.com\/(api\/)?oauth2\/authorize/,
		);
		expect(discord.param("client_id")).toBe("123");
		expect(discord.param("response_type")).toBe("code");
		expect(discord.param("scope")).toContain("identify");
		expect(discord.param("state")).toBeTruthy();
		expect(discord.param("redirect_uri")).toMatch(
			/^http:\/\/localhost:\d+\/auth\/callback$/,
		);
	});
});
