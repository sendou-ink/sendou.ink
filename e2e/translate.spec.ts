import fs from "node:fs";
import { expect, impersonate, test } from "./helpers/playwright";
import { TranslateLanguagePage } from "./pages/translate/translate-language-page";

const KEY = "common:actions.addNew";
const DRAFT = "Etwas Neues";

test.describe("Translate", () => {
	test("saves a draft, downloads it and previews it on the site", async ({
		page,
	}) => {
		const translate = new TranslateLanguagePage(page);

		// the draft is previewed on the "Add new" button, shown to logged in users
		await impersonate(page);
		await translate.goto("de", { status: "all", search: "actions.addNew" });

		const entry = translate.entry(KEY);

		await entry.textarea.fill("{{name}} Neu");
		await expect(entry.issues).toContainText("{{name}}");
		await expect(entry.saveButton).toBeDisabled();

		await entry.textarea.fill(DRAFT);
		await entry.saveButton.click();

		await translate.goto("de", { status: "drafts" });
		await expect(translate.locators.entries).toHaveCount(1);

		const downloadPromise = page.waitForEvent("download");
		await translate.locators.downloadButton.click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe("common.json");
		const common = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
		expect(common["actions.addNew"]).toBe(DRAFT);
		expect(common["actions.save"]).toBeTruthy();

		await translate.locators.previewButton.click();
		await page.waitForURL((url) => url.pathname === "/");

		await expect(translate.locators.previewBanner).toBeVisible();
		await expect(page.getByText(DRAFT).first()).toBeVisible();
	});

	test("imports translation files as drafts", async ({ page }) => {
		const translate = new TranslateLanguagePage(page);

		await translate.goto("de", { status: "drafts" });
		await translate.locators.importInput.setInputFiles({
			name: "common.json",
			mimeType: "application/json",
			buffer: Buffer.from(
				JSON.stringify({
					"actions.addNew": DRAFT,
					"actions.save": "Speichern",
					"not.a.key": "Ignoriert",
				}),
			),
		});

		await expect(translate.locators.entries).toHaveCount(1);
		await expect(translate.entry(KEY).textarea).toHaveValue(DRAFT);
	});
});
