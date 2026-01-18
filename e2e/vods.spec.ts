import { vodFormBaseSchema } from "~/features/vods/vods-schemas";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectStage,
	selectUser,
	selectWeapon,
	submit,
	test,
} from "~/utils/playwright";
import { createFormHelpers } from "~/utils/playwright-form";
import { newVodPage, VODS_PAGE, vodVideoPage } from "~/utils/urls";

const VIDEO_DATE = new Date(2024, 4, 15, 12, 0); // May 15, 2024 at 12:00

test.describe("VoDs page", () => {
	test("adds video (pov)", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: newVodPage(),
		});

		const form = createFormHelpers(page, vodFormBaseSchema);

		await form.fill(
			"youtubeUrl",
			"https://www.youtube.com/watch?v=o7kWlMZP3lM",
		);
		await form.fill(
			"title",
			"ITZXI Finals - Team Olive vs. Astral [CAMO TENTA PoV]",
		);
		await form.setDate("date", VIDEO_DATE);
		await form.select("type", "SCRIM");

		await selectUser({
			labelName: "Player (Pov)",
			page,
			userName: "Sendou",
		});

		await page.getByLabel("Start timestamp").fill("0:20");
		await page.getByRole("radio", { name: "Tower Control" }).click();
		await selectStage({ page, name: "Hammerhead Bridge", nth: 0 });
		await selectWeapon({
			name: "Zink Mini Splatling",
			page,
			testId: "match-0-weapon",
		});

		await page.getByRole("button", { name: "Add", exact: true }).click();

		await page.getByLabel("Start timestamp").last().fill("5:55");
		await page.getByRole("radio", { name: "Rainmaker" }).last().click();
		await selectStage({ page, name: "Museum d'Alfonsino", nth: 1 });
		await selectWeapon({
			name: "Tenta Brella",
			page,
			testId: "match-1-weapon",
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

		const form = createFormHelpers(page, vodFormBaseSchema);

		await form.fill(
			"youtubeUrl",
			"https://www.youtube.com/watch?v=QFk1Gf91SwI",
		);
		await form.fill(
			"title",
			"BIG ! vs Starburst - Splatoon 3 Grand Finals - The Big House 10",
		);
		await form.setDate("date", VIDEO_DATE);
		await form.select("type", "CAST");

		await page.keyboard.press("Enter");

		await page.getByLabel("Start timestamp").fill("0:25");
		await page.getByRole("radio", { name: "Clam Blitz" }).click();
		await selectStage({ page, name: "MakoMart" });

		// Fill team 1 weapons (Luna Blaster x4)
		for (let i = 0; i < 4; i++) {
			await selectWeapon({
				name: "Luna Blaster",
				page,
				testId: `match-0-team1-weapon-${i}`,
			});
		}
		// Fill team 2 weapons (Tenta Brella x4)
		for (let i = 0; i < 4; i++) {
			await selectWeapon({
				name: "Tenta Brella",
				page,
				testId: `match-0-team2-weapon-${i}`,
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
			testId: "match-3-weapon",
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

		const nzapUserPageLink = page.getByRole("link", { name: "N-ZAP" });

		await nzapUserPageLink.isVisible();
		await selectWeapon({ page, name: "Carbon Roller" });
		await isNotVisible(nzapUserPageLink);
	});
});
