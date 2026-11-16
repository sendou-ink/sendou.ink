import { arrayMove } from "@dnd-kit/sortable";
import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { Tables } from "~/db/tables";
import {
	DEFAULT_WIDGETS,
	findWidgetById,
	maxWidgetsPerSlot,
} from "~/features/user-page/core/widgets/portfolio";
import { SelectedWidgetsEditor } from "./SelectedWidgetsEditor";

/** Scrolled into the page's tall content, where the editor sticks to the top as on the edit widgets page. */
const SCROLLED_Y = 1000;

beforeEach(() => {
	window.scrollTo(0, 0);
});

afterEach(() => {
	window.scrollTo(0, 0);
});

describe("SelectedWidgetsEditor", () => {
	test("drops a widget dragged past the top of its list into the first slot", async () => {
		await renderStickyEditor();

		const drag = startDrag("x-rank-peaks");
		await drag.moveTo(aboveFirstWidget());
		await drag.drop();

		expect(mainWidgetIds()).toEqual([
			"x-rank-peaks",
			"weapon-pool",
			"badges-owned",
			"bio",
		]);
	});

	test("drops a widget into the first slot when the page scrolls mid-drag", async () => {
		await renderStickyEditor();

		const drag = startDrag("x-rank-peaks");
		await drag.moveBy(0, 10);
		await scrollPageBy(600);
		await drag.moveTo(aboveFirstWidget());
		await drag.drop();

		expect(mainWidgetIds().slice(0, 2)).toEqual([
			"x-rank-peaks",
			"weapon-pool",
		]);
	});

	test("keeps the dragged widget's preview under the pointer when the page scrolls mid-drag", async () => {
		await renderStickyEditor();

		const drag = startDrag("x-rank-peaks");
		await drag.moveBy(0, 10);
		const previewTop = dragPreview().getBoundingClientRect().top;
		await scrollPageBy(600);
		await nextFrame();

		expect(dragPreview().getBoundingClientRect().top).toBe(previewTop);
		await drag.drop();
	});

	test("doesn't scroll the page while a widget is held at the top of the screen", async () => {
		await renderStickyEditor();

		const drag = startDrag("x-rank-peaks");
		await drag.moveTo({ x: drag.startX, y: 2 });
		await new Promise((resolve) => setTimeout(resolve, 300));

		expect(window.scrollY).toBe(SCROLLED_Y);
		await drag.drop();
	});
});

async function renderStickyEditor() {
	function Harness() {
		const [widgets, setWidgets] = React.useState(
			DEFAULT_WIDGETS as Array<Tables["UserWidget"]["widget"]>,
		);

		const widgetsOfSlot = (slot: "main" | "side") =>
			widgets.filter((widget) => findWidgetById(widget.id)?.slot === slot);

		return (
			<div style={{ height: 5000 }}>
				<div style={{ position: "sticky", top: 0, width: 500 }}>
					<SelectedWidgetsEditor
						mainWidgets={widgetsOfSlot("main")}
						sideWidgets={widgetsOfSlot("side")}
						maxWidgets={maxWidgetsPerSlot(false)}
						onMoveWidget={(widgetId, targetWidgetId) =>
							setWidgets(
								arrayMove(
									widgets,
									widgets.findIndex((widget) => widget.id === widgetId),
									widgets.findIndex((widget) => widget.id === targetWidgetId),
								),
							)
						}
						onDragStart={() => {}}
						onRemoveWidget={() => {}}
						onSettingsChange={() => {}}
						expandedWidgetId={null}
						onToggleExpanded={() => {}}
						saveAttempted={false}
					/>
				</div>
			</div>
		);
	}

	const router = createMemoryRouter([{ path: "*", element: <Harness /> }], {
		initialEntries: ["/"],
	});
	await render(<RouterProvider router={router} />);

	window.scrollTo(0, SCROLLED_Y);
	await nextFrame();
}

/** Presses a widget's drag handle; the pointer then moves and lifts on it, the way dnd-kit listens to a drag. */
function startDrag(widgetId: string) {
	const handle = dragHandle(widgetId);
	const box = handle.getBoundingClientRect();
	const position = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

	dispatchPointer(handle, "pointerdown", position);

	const moveTo = async (target: { x: number; y: number }) => {
		const steps = 10;
		const from = { ...position };
		for (let step = 1; step <= steps; step++) {
			position.x = from.x + ((target.x - from.x) * step) / steps;
			position.y = from.y + ((target.y - from.y) * step) / steps;
			dispatchPointer(handle, "pointermove", position);
			await nextFrame();
		}
	};

	return {
		startX: position.x,
		moveTo,
		moveBy: (dx: number, dy: number) =>
			moveTo({ x: position.x + dx, y: position.y + dy }),
		drop: async () => {
			dispatchPointer(handle, "pointerup", position);
			await nextFrame();
		},
	};
}

function aboveFirstWidget() {
	const firstWidget = dragHandle(mainWidgetIds()[0]).getBoundingClientRect();

	return { x: firstWidget.x + firstWidget.width / 2, y: firstWidget.y - 60 };
}

function dispatchPointer(
	target: Element,
	type: "pointerdown" | "pointermove" | "pointerup",
	{ x, y }: { x: number; y: number },
) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			button: 0,
			isPrimary: true,
			pointerId: 1,
		}),
	);
}

async function scrollPageBy(pixels: number) {
	window.scrollBy(0, pixels);
	await nextFrame();
	await nextFrame();
}

function dragHandle(widgetId: string) {
	const handle = document.querySelector(
		`[data-testid="drag-widget-${widgetId}"]`,
	);
	if (!handle) throw new Error(`no drag handle for ${widgetId}`);
	return handle;
}

function dragPreview() {
	const preview = document.querySelector(
		'[data-testid="dragged-widget-preview"]',
	);
	if (!preview) throw new Error("no drag preview rendered");
	return preview;
}

function mainWidgetIds() {
	return [...document.querySelectorAll('[data-testid^="drag-widget-"]')]
		.map((handle) =>
			(handle.getAttribute("data-testid") ?? "").replace("drag-widget-", ""),
		)
		.filter((widgetId) => findWidgetById(widgetId)?.slot === "main");
}

function nextFrame() {
	return new Promise((resolve) => requestAnimationFrame(resolve));
}
