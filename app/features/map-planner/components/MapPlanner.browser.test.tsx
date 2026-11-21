import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
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
