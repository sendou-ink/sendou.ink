import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { vodVideoPage } from "~/utils/urls";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { NewVodPage } from "./pages/vods/new-vod-page";
import { VodPage } from "./pages/vods/vod-page";
import { VodsPage } from "./pages/vods/vods-page";

const VIDEO_DATE = new Date(2024, 4, 15, 12, 0); // May 15, 2024 at 12:00
const FORMATTED_VIDEO_DATE = `${VIDEO_DATE.getMonth() + 1}/${VIDEO_DATE.getDate()}/${VIDEO_DATE.getFullYear()}`;

const LUNA_BLASTER: MainWeaponId = 200;
const ZINK_MINI_SPLATLING: MainWeaponId = 4001;
const TENTA_BRELLA: MainWeaponId = 6010;

const SCORCH_GORGE: StageId = 0;

test.describe("VoDs page", () => {
	test("adds video (pov)", async ({ page, factories }) => {
		await factories.UserFactory.grant(ADMIN_ID, { roles: ["VIDEO_ADDER"] });

		await impersonate(page);

		const newVod = new NewVodPage(page);
		await newVod.goto();

		await newVod.form.fill(
			"youtubeUrl",
			"https://www.youtube.com/watch?v=o7kWlMZP3lM",
		);
		await newVod.form.fill(
			"title",
			"ITZXI Finals - Team Olive vs. Astral [CAMO TENTA PoV]",
		);
		await newVod.form.setDate("date", VIDEO_DATE);
		await newVod.form.select("type", "SCRIM");

		await newVod.selectPov("Sendou");

		const firstMatch = newVod.match(0);
		await firstMatch.setStartsAt("0:20");
		await firstMatch.selectMode("Tower Control");
		await firstMatch.selectStage("Hammerhead Bridge");
		await firstMatch.selectWeapon("Zink Mini Splatling");

		await newVod.addMatch();

		const secondMatch = newVod.match(1);
		await secondMatch.setStartsAt("5:55");
		await secondMatch.selectMode("Rainmaker");
		await secondMatch.selectStage("Museum d'Alfonsino");
		await secondMatch.selectWeapon("Tenta Brella");

		const vod = await newVod.save();

		await expect(vod.locators.publishedAt).toContainText(FORMATTED_VIDEO_DATE);
		await expect(vod.weaponImage(ZINK_MINI_SPLATLING)).toBeVisible();
		await expect(vod.weaponImage(TENTA_BRELLA)).toBeVisible();

		await vod.openCopyTimestamps();
		await expect(vod.locators.timestamps).toHaveValue(
			[
				"0:00 Intro",
				"0:20 Zink Mini Splatling / TC Hammerhead Bridge",
				"5:55 Tenta Brella / RM Museum d'Alfonsino",
			].join("\n"),
		);
	});

	test("adds video (cast)", async ({ page, factories }) => {
		await factories.UserFactory.grant(ADMIN_ID, { roles: ["VIDEO_ADDER"] });

		await impersonate(page);

		const newVod = new NewVodPage(page);
		await newVod.goto();

		await newVod.form.fill(
			"youtubeUrl",
			"https://www.youtube.com/watch?v=QFk1Gf91SwI",
		);
		await newVod.form.fill(
			"title",
			"BIG ! vs Starburst - Splatoon 3 Grand Finals - The Big House 10",
		);
		await newVod.form.setDate("date", VIDEO_DATE);
		await newVod.form.select("type", "CAST");

		const match = newVod.match(0);
		await match.setStartsAt("0:25");
		await match.selectMode("Clam Blitz");
		await match.selectStage("MakoMart");

		for (let i = 0; i < 4; i++) {
			await match.selectTeamWeapon(1, i, "Luna Blaster");
		}
		for (let i = 0; i < 4; i++) {
			await match.selectTeamWeapon(2, i, "Tenta Brella");
		}

		const vod = await newVod.save();

		for (let i = 0; i < 8; i++) {
			await expect(
				vod.weaponImage(i < 4 ? LUNA_BLASTER : TENTA_BRELLA, i),
			).toBeVisible();
		}
	});

	test("edits and deletes vod", async ({ page, factories }) => {
		const existingVod = await factories.VodFactory.create({
			submitterUserId: ADMIN_ID,
			pov: { type: "USER", userId: ADMIN_ID },
			matches: [
				{
					startsAt: "0:00",
					stageId: SCORCH_GORGE,
					mode: "SZ",
					weapons: [TENTA_BRELLA],
				},
			],
		});

		await factories.UserFactory.grant(ADMIN_ID, { roles: ["VIDEO_ADDER"] });

		await impersonate(page);

		const vod = new VodPage(page);
		await vod.goto(existingVod.id);

		const editVod = await vod.openEdit();
		await editVod.match(0).selectWeapon("Luna Blaster");
		await editVod.save();

		await expect(page).toHaveURL(vodVideoPage(existingVod.id));
		await expect(vod.weaponImage(LUNA_BLASTER)).toBeVisible();

		await vod.delete();

		await expect(page).toHaveURL(/\/u\/.+\/vods/);

		const vods = new VodsPage(page);
		await vods.goto();

		await expect(vods.locators.noVodsText).toBeVisible();
	});

	test("operates vod filters", async ({ page, factories }) => {
		await factories.VodFactory.create({
			submitterUserId: ADMIN_ID,
			pov: { type: "USER", userId: NZAP_TEST_ID },
			matches: [
				{
					startsAt: "0:00",
					stageId: SCORCH_GORGE,
					mode: "SZ",
					weapons: [TENTA_BRELLA],
				},
			],
		});

		await impersonate(page);

		const vods = new VodsPage(page);
		await vods.goto();

		const nzapPovLink = vods.povLink("N-ZAP");
		await expect(nzapPovLink).toBeVisible();

		await vods.filterByWeapon("Carbon Roller");

		await isNotVisible(nzapPovLink);
		await expect(vods.locators.noVodsText).toBeVisible();
	});
});
