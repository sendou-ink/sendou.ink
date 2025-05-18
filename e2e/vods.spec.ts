import test, { expect, type Page } from "@playwright/test";
import {
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectUser,
	selectWeapon,
	submit,
} from "~/utils/playwright";
import { VODS_PAGE, newVodPage, vodVideoPage } from "~/utils/urls";

const chooseVideoDate = async (page: Page) => {
	await page.getByTestId("open-calendar-button").click();
	await page
		.getByTestId("choose-date-button")
		.filter({ has: page.locator(`text="1"`) })
		.first()
		.click();
};

test.describe("VoDs page", () => {
	test("adds video (pov)", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: newVodPage(),
		});

		await page
			.getByLabel("YouTube URL")
			.fill("https://www.youtube.com/watch?v=o7kWlMZP3lM");

		await page
			.getByLabel("Video title")
			.fill("ITZXI Finals - Team Olive vs. Astral [CAMO TENTA PoV]");

		await chooseVideoDate(page);

		await page.getByLabel("Type").selectOption("SCRIM");

		await selectUser({
			labelName: "Player (Pov)",
			page,
			userName: "Sendou",
		});

		await page.getByLabel("Start timestamp").fill("0:20");
		await page.getByLabel("Mode").selectOption("TC");
		await page.getByLabel("Stage").selectOption("5");
		await selectWeapon({
			name: "Zink Mini Splatling",
			page,
			inputName: "match-0-weapon",
		});

		await page.getByTestId("add-field-button").click();

		await page.getByLabel("Start timestamp").last().fill("5:55");
		await page.getByLabel("Mode").last().selectOption("RM");
		await page.getByLabel("Stage").last().selectOption("6");
		await selectWeapon({
			name: "Tenta Brella",
			page,
			inputName: "match-1-weapon",
		});

		await submit(page);

		const now = new Date();
		const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
		await page.getByText(formattedDate).isVisible();
		await page.getByTestId("weapon-img-4001").isVisible();
		await page.getByTestId("weapon-img-6010").isVisible();
	});

	test("adds video (cast)", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: newVodPage(),
		});

		await page
			.getByLabel("YouTube URL")
			.fill("https://www.youtube.com/watch?v=QFk1Gf91SwI");

		await page
			.getByLabel("Video title")
			.fill("BIG ! vs Starburst - Splatoon 3 Grand Finals - The Big House 10");

		await chooseVideoDate(page);

		await page.getByLabel("Type").selectOption("CAST");

		await page.keyboard.press("Enter");

		await page.getByLabel("Start timestamp").fill("0:25");
		await page.getByLabel("Mode").selectOption("CB");
		await page.getByLabel("Stage").selectOption("10");

		for (let i = 0; i < 8; i++) {
			await selectWeapon({
				name: i < 4 ? "Luna Blaster" : "Tenta Brella",
				page,
				inputName: `player-${i}-weapon`,
			});
		}

		await submit(page);

		for (let i = 0; i < 8; i++) {
			await page
				.getByTestId(`weapon-img-${i < 4 ? 200 : 6010}-${i}`)
				.isVisible();
		}
	});

	test("edits vod", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: vodVideoPage(1),
		});

		await page.getByTestId("edit-vod-button").click();

		await selectWeapon({
			name: "Luna Blaster",
			page,
			inputName: "match-3-weapon",
		});

		await submit(page);

		await expect(page).toHaveURL(vodVideoPage(1));

		await page.getByTestId("weapon-img-200-4").isVisible();
	});

	test("operates vod filters", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: VODS_PAGE,
		});

		await page.getByText("N-ZAP").isVisible();
		await selectWeapon({ page, name: "Carbon Roller" });
		await isNotVisible(page.getByText("N-ZAP"));
	});
});
