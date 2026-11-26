import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import * as PlanEditor from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import * as PlanTools from "../core/PlanTools";
import { typicalPlan } from "../tests/fixtures";
import { ToolSidebar } from "./ToolSidebar";

async function renderSidebar() {
	const editor = PlanEditor.create(typicalPlan());
	const selection = PlanSelection.create();
	const tools = PlanTools.create();

	const screen = await render(
		<ToolSidebar editor={editor} selection={selection} tools={tools} />,
	);
	return { screen, editor, selection, tools };
}

describe("ToolSidebar", () => {
	test("picks the tool, colour and size of new drawings", async () => {
		const { screen, tools } = await renderSidebar();

		await screen.getByTestId("plan-tool-arrow").click();
		await screen.getByTestId("plan-color-red").click();
		await screen.getByTestId("plan-size-L").click();

		expect(tools.get()).toEqual({ tool: "arrow", color: "#ff4d4d", size: "L" });
		await expect
			.element(screen.getByTestId("plan-tool-arrow"))
			.toHaveAttribute("aria-pressed", "true");
		await expect
			.element(screen.getByTestId("plan-color-red"))
			.toHaveAttribute("aria-pressed", "true");
	});

	test("shows and restyles the selected drawings, one undo step", async () => {
		const { screen, editor, selection } = await renderSidebar();
		selection.set({ type: "drawings", ids: ["arrow000", "arrow001"] });

		await expect
			.element(screen.getByTestId("plan-color-red"))
			.toHaveAttribute("aria-pressed", "true");

		await screen.getByTestId("plan-color-green").click();

		const colors = editor
			.getDocument()
			.drawings.filter((drawing) => drawing.id.startsWith("arrow"))
			.map((drawing) => drawing.color);
		expect(colors).toEqual(["#3ddc84", "#3ddc84", "#ff4d4d", "#ff4d4d"]);
		editor.undo();
		expect(editor.getDocument()).toEqual(typicalPlan());
	});

	test("picking a colour or size leaves the focus in a label being typed", async () => {
		const { screen } = await renderSidebar();
		const field = document.createElement("textarea");
		document.body.append(field);
		field.focus();

		await screen.getByTestId("plan-color-pink").click();
		await screen.getByTestId("plan-size-S").click();

		expect(document.activeElement).toBe(field);
		field.remove();
	});

	test("deletes the selected drawings", async () => {
		const { screen, editor, selection } = await renderSidebar();
		await expect
			.element(screen.getByTestId("plan-delete-button"))
			.toBeDisabled();

		selection.set({ type: "drawings", ids: ["rect0001"] });
		await screen.getByTestId("plan-delete-button").click();

		expect(
			editor
				.getDocument()
				.drawings.some((drawing) => drawing.id === "rect0001"),
		).toBe(false);
	});
});
