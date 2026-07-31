import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { AnythingAdder } from "./pages/layout/anything-adder";
import { LFGPage } from "./pages/lfg/lfg-page";
import { NewLFGPostPage } from "./pages/lfg/new-lfg-post-page";

test.describe("LFG", () => {
	test("adds a new lfg post", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await new AnythingAdder(page).add("lfgPost");

		const newPost = new NewLFGPostPage(page);
		await newPost.form.fill("postText", "looking for a cool team");
		await newPost.save();

		const lfg = new LFGPage(page);
		await expect(lfg.locators.addFilterButton).toBeVisible();
		await expect(lfg.post("looking for a cool team")).toBeVisible();
	});

	test("creates post with custom languages", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);

		const newPost = new NewLFGPostPage(page);
		await newPost.goto();

		await newPost.form.fill("postText", "looking for Japanese/Korean team");
		await newPost.checkLanguage("日本語");
		await newPost.checkLanguage("한국어");
		await newPost.save();

		await expect(new LFGPage(page).languagePill("JA / KO")).toBeVisible();
	});

	test("edits post languages", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);

		const newPost = new NewLFGPostPage(page);
		await newPost.goto();

		await newPost.form.fill("postText", "test post for language editing");
		await newPost.checkLanguage("Dansk");
		await newPost.save();

		const lfg = new LFGPage(page);
		await expect(lfg.languagePill("DA")).toBeVisible();
		await expect(lfg.post("test post for language editing")).toBeVisible();

		const editPost = await lfg.editFirstPost();
		await editPost.uncheckLanguage("Dansk");
		await editPost.checkLanguage("Español");
		await editPost.save();

		await expect(lfg.locators.addFilterButton).toBeVisible();
		await expect(lfg.post("test post for language editing")).toBeVisible();
		await expect(lfg.languagePill("ES")).toBeVisible();
	});

	test("filters posts by language", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);

		const newPost = new NewLFGPostPage(page);
		await newPost.goto();

		await newPost.form.fill("postText", "Japanese speaking team");
		await newPost.checkLanguage("日本語");
		await newPost.save();

		const lfg = new LFGPage(page);
		await expect(lfg.post("Japanese speaking team")).toBeVisible();

		await lfg.addLanguageFilter();
		await lfg.selectFilterLanguage("ja");

		await expect(lfg.post("Japanese speaking team")).toBeVisible();

		await lfg.selectFilterLanguage("es");

		await expect(lfg.post("Japanese speaking team")).not.toBeVisible();
	});
});
