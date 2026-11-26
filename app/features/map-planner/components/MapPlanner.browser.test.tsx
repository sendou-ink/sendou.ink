import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { toastQueue } from "~/components/elements/Toast";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import * as PlanDocument from "../core/PlanDocument";
import * as PlanEncoding from "../core/PlanEncoding";
import { autosavedPlanPersisted } from "../plans-persisted";
import { planLinkPath } from "../plans-urls";
import { typicalPlan } from "../tests/fixtures";
import { MapPlanner } from "./MapPlanner";

afterEach(() => {
	vi.restoreAllMocks();
	window.history.replaceState(null, "", window.location.pathname);
	window.localStorage.removeItem(autosavedPlanPersisted.key);
});

async function renderPlanner(search = "") {
	window.history.replaceState(null, "", `${window.location.pathname}${search}`);
	const router = createBrowserRouter([{ path: "*", element: <MapPlanner /> }]);

	return render(<RouterProvider router={router} />);
}

function autosavedPlan() {
	const saved = PersistedState.read(autosavedPlanPersisted);
	if (!saved) return null;

	const decoded = PlanEncoding.decode(saved);
	return decoded.ok ? decoded.document : null;
}

function linkedPlan() {
	const plan = typicalPlan();
	plan.stageId = 3;
	plan.slots = plan.slots.map((player, slot) => (slot === 0 ? player : null));
	return plan;
}

describe("MapPlanner", () => {
	test("restores the autosaved plan with its map shown", async () => {
		PersistedState.write(
			autosavedPlanPersisted,
			PlanEncoding.encode(typicalPlan()),
		);

		const screen = await renderPlanner();

		await expect
			.element(screen.getByTestId("plan-slot-0"))
			.not.toHaveAttribute("aria-label", "Add player");
		await expect
			.element(
				screen
					.getByTestId("plan-stage-picker-button")
					.getByRole("img", { name: "Sturgeon Shipyard" }),
			)
			.toBeInTheDocument();
	});

	test("autosaves after a change once a map is picked", async () => {
		const screen = await renderPlanner();
		expect(autosavedPlan()).toBeNull();

		await screen.getByTestId("plan-stage-3").click();

		await vi.waitFor(() => expect(autosavedPlan()?.stageId).toBe(3));
	});

	test("opens the plan of a link over the autosaved one, undo bringing that back", async () => {
		PersistedState.write(
			autosavedPlanPersisted,
			PlanEncoding.encode(typicalPlan()),
		);
		const path = planLinkPath(linkedPlan())!;

		const screen = await renderPlanner(path.slice(path.indexOf("?")));

		await expect
			.element(screen.getByTestId("plan-slot-1"))
			.toHaveAttribute("aria-label", "Add player");
		await vi.waitFor(() => expect(window.location.search).toBe(""));
		await vi.waitFor(() => expect(autosavedPlan()).toEqual(linkedPlan()));

		await screen.getByTestId("plan-undo-button").click();

		await expect
			.element(screen.getByTestId("plan-slot-1"))
			.not.toHaveAttribute("aria-label", "Add player");
	});

	test("a stage and mode link opens an empty plan of that map", async () => {
		PersistedState.write(
			autosavedPlanPersisted,
			PlanEncoding.encode(typicalPlan()),
		);

		await renderPlanner("?stage=5&mode=TC");

		await vi.waitFor(() =>
			expect(autosavedPlan()).toEqual(
				PlanDocument.empty({ stageId: 5, mode: "TC" }),
			),
		);
	});

	test("tells when the plan of a link can't be opened", async () => {
		const addToast = vi.spyOn(toastQueue, "add");

		await renderPlanner("?plan=broken");

		await vi.waitFor(() =>
			expect(addToast).toHaveBeenCalledWith({
				message: "The plan in this link couldn't be opened",
				variant: "error",
			}),
		);
	});

	test("opens a plan file as one undo step", async () => {
		const screen = await renderPlanner();
		const file = new File([PlanEncoding.encode(linkedPlan())], "plan.json");

		await userEvent.upload(screen.getByTestId("plan-file-input"), file);

		await vi.waitFor(() => expect(autosavedPlan()).toEqual(linkedPlan()));
		await screen.getByTestId("plan-undo-button").click();
		await expect
			.element(screen.getByTestId("plan-slot-0"))
			.toHaveAttribute("aria-label", "Add player");
	});

	test("tells an old tldraw planner file apart", async () => {
		const addToast = vi.spyOn(toastQueue, "add");
		const screen = await renderPlanner();
		const file = new File(
			[JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] })],
			"plan.tldr",
		);

		await userEvent.upload(screen.getByTestId("plan-file-input"), file);

		await vi.waitFor(() =>
			expect(addToast).toHaveBeenCalledWith({
				message:
					"Plans from the old planner (.tldr files) can't be opened anymore",
				variant: "error",
			}),
		);
	});
});

async function renderWithPlan() {
	PersistedState.write(
		autosavedPlanPersisted,
		PlanEncoding.encode(typicalPlan()),
	);
	return renderPlanner();
}

describe("MapPlanner hotkeys", () => {
	beforeEach(async () => {
		await page.viewport(1280, 800);
	});

	test("a number key on an empty slot opens its weapon picker, the search focused", async () => {
		const screen = await renderPlanner();
		await screen.getByTestId("plan-stage-3").click();

		await userEvent.keyboard("2");

		await expect
			.element(screen.getByTestId("plan-weapon-search"))
			.toHaveFocus();
	});

	test("state letters change the selected player, and Ctrl+Z undoes them", async () => {
		const screen = await renderWithPlan();
		const slot = screen.getByTestId("plan-slot-0");

		await userEvent.keyboard("1");
		await expect.element(slot).toHaveAttribute("aria-pressed", "true");
		await userEvent.keyboard("d");
		await expect.element(slot).toHaveAttribute("data-status", "dead");

		await userEvent.keyboard("{Control>}z{/Control}");
		await expect.element(slot).toHaveAttribute("data-status", "normal");
	});

	test("hotkeys don't fire while typing a label, which Enter starts", async () => {
		const screen = await renderWithPlan();
		const label = screen.getByTestId("plan-slot-0-label");

		await userEvent.keyboard("1");
		await userEvent.keyboard("{Enter}");
		await expect.element(label).toHaveFocus();
		await userEvent.keyboard("d");

		await expect
			.element(screen.getByTestId("plan-slot-0"))
			.toHaveAttribute("data-status", "normal");
	});

	test("select all and Delete remove every drawing", async () => {
		await renderWithPlan();

		await userEvent.keyboard("{Control>}a{/Control}");
		await userEvent.keyboard("{Delete}");

		await vi.waitFor(() => expect(autosavedPlan()?.drawings).toEqual([]));
	});

	test("a tool's key takes it in hand", async () => {
		const screen = await renderWithPlan();

		await userEvent.keyboard("p");

		await expect
			.element(screen.getByTestId("plan-tool-pen"))
			.toHaveAttribute("aria-pressed", "true");
	});

	test("? opens the cheat sheet", async () => {
		const screen = await renderWithPlan();

		await userEvent.keyboard("?");

		await expect.element(screen.getByTestId("plan-hotkey-sheet")).toBeVisible();
	});

	test("the full screen button and F put the page in full screen", async () => {
		const requestFullscreen = vi
			.spyOn(document.documentElement, "requestFullscreen")
			.mockResolvedValue();
		const screen = await renderWithPlan();

		await screen.getByTestId("plan-full-screen-button").click();
		await userEvent.keyboard("f");

		expect(requestFullscreen).toHaveBeenCalledTimes(2);
	});
});

describe("MapPlanner on a narrow screen", () => {
	beforeEach(async () => {
		await page.viewport(375, 667);
	});

	test("the action bar folds away behind a button, leaving the stage picker", async () => {
		const screen = await renderWithPlan();

		await expect
			.element(screen.getByTestId("plan-stage-picker-button"))
			.toBeVisible();
		await expect
			.element(screen.getByTestId("plan-copy-link-button"))
			.not.toBeVisible();

		await screen.getByTestId("plan-more-actions-button").click();

		await expect
			.element(screen.getByTestId("plan-copy-link-button"))
			.toBeVisible();
	});

	test("the tools fold away behind the tool in hand, folding again once one is picked", async () => {
		const screen = await renderWithPlan();
		const pen = screen.getByTestId("plan-tool-pen");
		await expect.element(pen).not.toBeVisible();

		await screen.getByTestId("plan-tools-expand-button").click();
		await pen.click();

		await expect.element(pen).not.toBeVisible();
		await expect.element(pen).toHaveAttribute("aria-pressed", "true");
	});
});
