import type { Page } from "@playwright/test";
import { expect, submit, waitForPOSTResponse } from "./playwright";

/**
 * Helpers for interacting with the tournament match page in e2e tests.
 *
 * The match page splits its UI into URL-driven tabs (rosters/action/admin/etc.)
 * — these helpers handle the navigation so individual tests can stay focused on
 * the assertion they care about.
 */

type Side = 1 | 2;

export const navigateToMatch = async (page: Page, matchId: number) => {
	await expect(async () => {
		await page.locator(`[data-match-id="${matchId}"]`).click();
		await expect(page.getByTestId("back-to-bracket-button")).toBeVisible();
	}).toPass();
};

export const backToBracket = async (page: Page) => {
	await expect(async () => {
		await page.getByTestId("back-to-bracket-button").click();
		await expect(page.getByTestId("brackets-viewer")).toBeVisible();
	}).toPass();
};

export const expectScore = (page: Page, score: [number, number]) =>
	expect(page.getByText(score.join("-")).first()).toBeVisible();

const TAB_LABELS = {
	action: "Action",
	admin: "Admin",
	result: "Result",
	rosters: "Rosters",
} as const;

export const goToTab = async (
	page: Page,
	tab: "action" | "admin" | "result" | "rosters",
) => {
	// When teams have more members than the minimum, the action tab is hidden
	// until each team's active roster is locked in via the rosters tab. Auto-set
	// any roster that's still in default-editing mode so callers can stay focused
	// on the flow they actually care about.
	if (tab === "action") {
		await ensureActiveRostersSet(page);
	}
	await page.getByRole("tab", { name: TAB_LABELS[tab] }).click();
};

const ensureActiveRostersSet = async (page: Page) => {
	const sides = ["alpha", "bravo"] as const;

	// If the action tab is already there, no rosters need setting.
	if ((await page.getByRole("tab", { name: TAB_LABELS.action }).count()) > 0) {
		return;
	}

	// Editing inputs only render on the rosters tab — switch there.
	await page.getByRole("tab", { name: TAB_LABELS.rosters }).click();
	// Wait for the rosters panel to be ready before probing for editing UI.
	await expect(page.getByRole("tabpanel", { name: "Rosters" })).toBeVisible();

	for (const side of sides) {
		const submitButton = page.getByTestId(`save-active-roster-button-${side}`);
		if ((await submitButton.count()) === 0) continue;

		// Default-editing renders all members unchecked; pick the first 4.
		for (let i = 0; i < 4; i++) {
			const checkbox = page.getByTestId(`player-checkbox-${side}-${i}`);
			if (!(await checkbox.isChecked())) await checkbox.click();
		}
		await submit(page, `save-active-roster-button-${side}`);
	}
};

/**
 * Sweeps `mapsToReport` maps in a row, all won by `winner`. By default the
 * last map ends the set (the typical case — full Bo3/Bo5 sweep), and the
 * helper goes through the confirmation screen for that map. Pass
 * `setEnds: false` when reporting a partial set (e.g. only 1 of a Bo3).
 */
export const reportResult = async (
	page: Page,
	{
		mapsToReport,
		winner = 1,
		setEnds = true,
	}: { mapsToReport: number; winner?: Side; setEnds?: boolean },
) => {
	for (let i = 0; i < mapsToReport; i++) {
		const isFinal = setEnds && i === mapsToReport - 1;
		// Wait for the action panel to settle before clicking. waitForPOSTResponse
		// only waits for the POST itself; the loader revalidation that swaps in
		// the next map's component runs after, so a previous winner can still be
		// `data-selected="true"` here. Clicking too early hits the about-to-unmount
		// label and the selection is lost on remount.
		await expect(
			page.locator('[data-testid^="winner-radio-"][data-selected="true"]'),
		).toHaveCount(0);
		await page.getByTestId(`winner-radio-${winner}`).click();
		if (isFinal) {
			await page.getByTestId("report-score-button").click();
			await submit(page, "confirm-set-end-button");
		} else {
			await submit(page, "report-score-button");
		}
	}
};

export const undoLastReport = (page: Page) =>
	waitForPOSTResponse(page, async () => {
		await page.getByTestId("undo-score-button").click();
	});
