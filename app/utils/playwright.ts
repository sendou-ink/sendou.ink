import { expect, type Locator, type Page } from "@playwright/test";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { SeedVariation } from "~/features/api-private/routes/seed";
import { tournamentBracketsPage } from "./urls";

export async function selectWeapon({
	page,
	name,
	testId = "weapon-select",
}: {
	page: Page;
	name: string;
	testId?: string;
}) {
	await page.getByTestId(testId).click();
	await page.getByPlaceholder("Search weapons...").fill(name);
	await page
		.getByRole("listbox", { name: "Suggestions" })
		.getByTestId(`weapon-select-option-${name}`)
		.click();
}

export async function selectUser({
	page,
	userName,
	labelName,
	exact = false,
}: {
	page: Page;
	userName: string;
	labelName: string;
	exact?: boolean;
}) {
	const comboboxButton = page.getByLabel(labelName, { exact });
	const searchInput = page.getByTestId("user-search-input");
	const option = page.getByTestId("user-search-item").first();

	await expect(comboboxButton).not.toBeDisabled();

	await comboboxButton.click();
	await searchInput.fill(userName);
	await expect(option).toBeVisible();
	await page.keyboard.press("Enter");
}

/** page.goto that waits for the page to be hydrated before proceeding */
export async function navigate({ page, url }: { page: Page; url: string }) {
	await page.goto(url);
	await expectIsHydrated(page);
}

/** Waits and expects the page to be hydrated (click handlers etc. ready for testing) */
export async function expectIsHydrated(page: Page) {
	await expect(page.getByTestId("hydrated")).toHaveCount(1);
}

export function seed(page: Page, variation?: SeedVariation) {
	return page.request.post("/seed", {
		form: { variation: variation ?? "DEFAULT" },
	});
}

export function impersonate(page: Page, userId = ADMIN_ID) {
	return page.request.post(`/auth/impersonate?id=${userId}`);
}

export async function submit(page: Page, testId?: string) {
	const responsePromise = page.waitForResponse(
		(res) => res.request().method() === "POST",
	);
	await page.getByTestId(testId ?? "submit-button").click();
	await responsePromise;
}

export function isNotVisible(locator: Locator) {
	return expect(locator).toHaveCount(0);
}

export function modalClickConfirmButton(page: Page) {
	return page.getByTestId("confirm-button").click();
}

export async function fetchSendouInk<T>(url: string) {
	const res = await fetch(`http://localhost:6173${url}`);
	if (!res.ok) throw new Error("Response not successful");

	return res.json() as T;
}

export const startBracket = async (page: Page, tournamentId = 2) => {
	await seed(page);
	await impersonate(page);

	await navigate({
		page,
		url: tournamentBracketsPage({ tournamentId }),
	});

	await page.getByTestId("finalize-bracket-button").click();
	await page.getByTestId("confirm-finalize-bracket-button").click();
};
