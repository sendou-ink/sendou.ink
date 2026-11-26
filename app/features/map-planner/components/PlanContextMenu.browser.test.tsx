import * as React from "react";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { ContextMenuTarget } from "../canvas/PlanCanvas";
import * as PlanEditor from "../core/PlanEditor";
import { typicalPlan } from "../tests/fixtures";
import { PlanContextMenu } from "./PlanContextMenu";

async function renderMenu(target: ContextMenuTarget) {
	const editor = PlanEditor.create(typicalPlan());
	const onClose = vi.fn();
	const onSwitchWeapon = vi.fn();

	function Harness() {
		const document = React.useSyncExternalStore(
			editor.subscribe,
			editor.getDocument,
		);
		return (
			<PlanContextMenu
				editor={editor}
				document={document}
				target={target}
				clientPoint={[100, 100]}
				onClose={onClose}
				onSwitchWeapon={onSwitchWeapon}
			/>
		);
	}

	const screen = await render(<Harness />);
	await expect.element(screen.getByTestId("plan-context-menu")).toBeVisible();
	return { screen, editor, onClose, onSwitchWeapon };
}

describe("PlanContextMenu", () => {
	test("a status marks the player and closes the menu", async () => {
		const { screen, editor, onClose } = await renderMenu({
			type: "player",
			slot: 2,
		});

		await screen.getByTestId("plan-menu-status-dead").click();

		expect(editor.getDocument().slots[2]?.status).toBe("dead");
		expect(onClose).toHaveBeenCalled();
	});

	test("marks the player's current status", async () => {
		const { screen } = await renderMenu({ type: "player", slot: 6 });

		await expect
			.element(screen.getByTestId("plan-menu-status-dead"))
			.toHaveClass(/itemActive/);
	});

	test("Enable special puts the player in special", async () => {
		const { screen, editor } = await renderMenu({ type: "player", slot: 2 });

		await screen.getByTestId("plan-menu-special").click();

		expect(editor.getDocument().slots[2]?.specialActive).toBe(true);
	});

	test("Throw sub drops a sub marker of the player", async () => {
		const { screen, editor } = await renderMenu({ type: "player", slot: 3 });

		await screen.getByTestId("plan-menu-throw-sub").click();

		expect(editor.getDocument().markers.at(-1)).toMatchObject({
			kind: "sub",
			owner: 3,
		});
	});

	test("Show radius toggles the player's radius", async () => {
		const { screen, editor } = await renderMenu({ type: "player", slot: 2 });

		await screen.getByTestId("plan-menu-radius").click();

		expect(editor.getDocument().slots[2]?.radiusShown).toBe(true);
	});

	test("Hide takes the token off the map", async () => {
		const { screen, editor } = await renderMenu({ type: "player", slot: 2 });

		await screen.getByTestId("plan-menu-hide").click();

		expect(editor.getDocument().slots[2]?.hidden).toBe(true);
	});

	test("Switch weapon opens the slot's weapon picker", async () => {
		const { screen, onSwitchWeapon } = await renderMenu({
			type: "player",
			slot: 4,
		});

		await screen.getByTestId("plan-menu-switch-weapon").click();

		expect(onSwitchWeapon).toHaveBeenCalledWith(4);
	});

	test("a marker's menu removes it", async () => {
		const { screen, editor } = await renderMenu({
			type: "marker",
			id: "mrk00002",
		});

		await screen.getByTestId("plan-menu-remove-marker").click();

		expect(editor.getDocument().markers.map((marker) => marker.id)).toEqual([
			"mrk00001",
			"mrk00003",
		]);
	});

	test("a drawing's menu brings it to the front", async () => {
		const { screen, editor } = await renderMenu({
			type: "drawings",
			ids: ["arrow000"],
		});

		await screen.getByTestId("plan-menu-bring-to-front").click();

		expect(editor.getDocument().drawings.at(-1)?.id).toBe("arrow000");
	});

	test("a drawing's menu can't send back what already is at the back", async () => {
		const { screen } = await renderMenu({
			type: "drawings",
			ids: ["stroke00", "stroke01"],
		});

		await expect
			.element(screen.getByTestId("plan-menu-send-to-back"))
			.toBeDisabled();
	});

	test("a drawing's menu deletes the drawings", async () => {
		const { screen, editor } = await renderMenu({
			type: "drawings",
			ids: ["rect0001", "text0001"],
		});

		await screen.getByTestId("plan-menu-delete-drawings").click();

		expect(
			editor
				.getDocument()
				.drawings.some((drawing) =>
					["rect0001", "text0001"].includes(drawing.id),
				),
		).toBe(false);
	});
});
