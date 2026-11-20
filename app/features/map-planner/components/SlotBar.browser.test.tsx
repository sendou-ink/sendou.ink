import * as React from "react";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import * as PlanDocument from "../core/PlanDocument";
import * as PlanEditor from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import { typicalPlan } from "../tests/fixtures";
import { SlotBar } from "./SlotBar";

async function renderSlotBar(
	initial = PlanDocument.empty({ stageId: 0, mode: "SZ" }),
) {
	const editor = PlanEditor.create(initial);
	const selection = PlanSelection.create();
	const onPlayerClick = vi.fn();
	const onPlayerContextMenu = vi.fn();

	function Harness() {
		const document = React.useSyncExternalStore(
			editor.subscribe,
			editor.getDocument,
		);
		const [pickerSlot, setPickerSlot] =
			React.useState<PlanDocument.SlotIndex | null>(null);
		return (
			<SlotBar
				editor={editor}
				document={document}
				selection={selection}
				pickerSlot={pickerSlot}
				onPickerSlotChange={setPickerSlot}
				onPlayerClick={onPlayerClick}
				onPlayerContextMenu={onPlayerContextMenu}
				onWeaponDragOut={vi.fn()}
			/>
		);
	}

	const screen = await render(<Harness />);
	return { screen, editor, selection, onPlayerClick, onPlayerContextMenu };
}

describe("SlotBar", () => {
	test("an empty slot opens the weapon picker with the search focused, Enter picks the first match", async () => {
		const { screen, editor, selection } = await renderSlotBar();

		await screen.getByTestId("plan-slot-5").click();
		await vi.waitFor(() =>
			expect(document.activeElement?.getAttribute("data-testid")).toBe(
				"plan-weapon-search",
			),
		);
		await userEvent.keyboard("Tri-Slosher{Enter}");

		expect(editor.getDocument().slots[5]).toMatchObject({
			weaponId: 3010,
			hidden: false,
		});
		expect(editor.getDocument().slots[5]?.position).not.toBeNull();
		expect(selection.get()).toEqual({ type: "player", slot: 5 });
		await expect
			.element(screen.getByTestId("plan-weapon-search"))
			.not.toBeInTheDocument();
	});

	test("clicking a weapon in the picker fills the slot", async () => {
		const { screen, editor } = await renderSlotBar();

		await screen.getByTestId("plan-slot-0").click();
		await screen.getByTestId("plan-weapon-40").click();

		expect(editor.getDocument().slots[0]?.weaponId).toBe(40);
	});

	test("double-clicking a filled slot opens the picker to switch the weapon in place", async () => {
		const { screen, editor } = await renderSlotBar(typicalPlan());

		await screen.getByTestId("plan-slot-1").dblClick();
		await screen.getByTestId("plan-weapon-50").click();

		expect(editor.getDocument().slots[1]).toEqual({
			...typicalPlan().slots[1],
			weaponId: 50,
		});
	});

	test("closing the picker opened on a filled slot changes nothing", async () => {
		const { screen, editor } = await renderSlotBar(typicalPlan());

		await screen.getByTestId("plan-slot-1").dblClick();
		await expect
			.element(screen.getByTestId("plan-weapon-search"))
			.toBeVisible();
		await userEvent.keyboard("{Escape}");

		await expect
			.element(screen.getByTestId("plan-weapon-search"))
			.not.toBeInTheDocument();
		expect(editor.getDocument()).toEqual(typicalPlan());
	});

	test("clicking a filled slot hands it to the planner", async () => {
		const { screen, onPlayerClick } = await renderSlotBar(typicalPlan());

		await screen.getByTestId("plan-slot-3").click();

		expect(onPlayerClick).toHaveBeenCalledWith(3);
	});

	test("right clicking a filled slot selects it and opens its context menu", async () => {
		const { screen, selection, onPlayerContextMenu } = await renderSlotBar(
			typicalPlan(),
		);

		await screen.getByTestId("plan-slot-2").click({ button: "right" });

		expect(onPlayerContextMenu).toHaveBeenCalledWith(2, expect.any(Array));
		expect(selection.get()).toEqual({ type: "player", slot: 2 });
	});

	test("shows the selected slot as pressed", async () => {
		const { screen, selection } = await renderSlotBar(typicalPlan());

		selection.set({ type: "player", slot: 6 });

		await expect
			.element(screen.getByTestId("plan-slot-6"))
			.toHaveAttribute("aria-pressed", "true");
		await expect
			.element(screen.getByTestId("plan-slot-2"))
			.toHaveAttribute("aria-pressed", "false");
	});

	test("the label is saved when Enter is pressed, as one undo step", async () => {
		const { screen, editor } = await renderSlotBar(typicalPlan());
		const input = screen.getByTestId("plan-slot-1-label");

		await input.fill("Fronter");
		await userEvent.keyboard("{Enter}");

		expect(editor.getDocument().slots[1]?.label).toBe("Fronter");
		editor.undo();
		expect(editor.getDocument()).toEqual(typicalPlan());
	});

	test("Escape throws away the edited label", async () => {
		const { screen, editor } = await renderSlotBar(typicalPlan());

		await screen.getByTestId("plan-slot-1-label").fill("Fronter");
		await userEvent.keyboard("{Escape}");

		expect(editor.getDocument().slots[1]?.label).toBe(
			typicalPlan().slots[1]?.label,
		);
	});

	test("removing a player empties the slot and removes their markers", async () => {
		const { screen, editor, selection } = await renderSlotBar(typicalPlan());
		selection.set({ type: "player", slot: 0 });

		await screen.getByTestId("plan-slot-0-remove").click();

		expect(editor.getDocument().slots[0]).toBeNull();
		expect(
			editor.getDocument().markers.some((marker) => marker.owner === 0),
		).toBe(false);
		expect(selection.get()).toBeNull();
	});
});
