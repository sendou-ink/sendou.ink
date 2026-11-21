import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import * as PlanDocument from "../core/PlanDocument";
import * as PlanEditor from "../core/PlanEditor";
import * as PlanSelection from "../core/PlanSelection";
import * as PlanTools from "../core/PlanTools";
import * as PlanCanvas from "./PlanCanvas";

/** A fifth of the map's size (to fit the test page), so the fitted map is drawn at a fifth from the container's top left. */
const MAP_TO_CONTAINER = 5;
const CONTAINER_SIZE = {
	width: PlanDocument.MAP_SIZE.width / MAP_TO_CONTAINER,
	height: PlanDocument.MAP_SIZE.height / MAP_TO_CONTAINER,
};

const RECTANGLE: PlanDocument.PlanDrawing = {
	id: "rect",
	type: "rectangle",
	color: "#ffffff",
	size: "M",
	from: [200, 200],
	to: [400, 300],
};
const LINE: PlanDocument.PlanDrawing = {
	id: "line",
	type: "line",
	color: "#ff4d4d",
	size: "M",
	from: [1000, 600],
	to: [1400, 600],
};

const LABEL: PlanDocument.PlanDrawing = {
	id: "label",
	type: "text",
	color: "#ffffff",
	size: "M",
	position: [400, 300],
	text: "push",
};

/** How far outside a selected drawing its resize handles sit, in screen pixels. */
const HANDLE_OFFSET = 6;

let cleanup: (() => void) | null = null;

afterEach(() => {
	cleanup?.();
	cleanup = null;
});

function setUp(plan = PlanDocument.empty({ stageId: 0, mode: "SZ" })) {
	const container = document.createElement("div");
	Object.assign(container.style, {
		position: "relative",
		width: `${CONTAINER_SIZE.width}px`,
		height: `${CONTAINER_SIZE.height}px`,
	});
	document.body.append(container);

	const editor = PlanEditor.create(plan);
	const selection = PlanSelection.create();
	const tools = PlanTools.create();
	const onContextMenu = vi.fn();
	const canvas = PlanCanvas.create({
		container,
		editor,
		selection,
		tools,
		isMapShown: false,
		onContextMenu,
	});
	cleanup = () => {
		canvas.destroy();
		container.remove();
	};

	const fire = (
		type: string,
		[mapX, mapY]: PlanDocument.Point,
		init: PointerEventInit = {},
	) => {
		const rect = container.getBoundingClientRect();
		konvaContent(container).dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: "mouse",
				isPrimary: true,
				clientX: rect.left + mapX / MAP_TO_CONTAINER,
				clientY: rect.top + mapY / MAP_TO_CONTAINER,
				button: type === "pointermove" ? -1 : 0,
				buttons: type === "pointerup" ? 0 : 1,
				...init,
			}),
		);
	};

	/** Presses at the first map point, moves through the others and lets go at the last. */
	const drag = async (
		points: PlanDocument.Point[],
		init: PointerEventInit = {},
	) => {
		await nextFrame();
		fire("pointerdown", points[0], init);
		for (const point of points.slice(1)) fire("pointermove", point, init);
		fire("pointerup", points.at(-1)!, init);
		await nextFrame();
	};

	const rightClick = async ([mapX, mapY]: PlanDocument.Point) => {
		await nextFrame();
		const rect = container.getBoundingClientRect();
		konvaContent(container).dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				cancelable: true,
				button: 2,
				clientX: rect.left + mapX / MAP_TO_CONTAINER,
				clientY: rect.top + mapY / MAP_TO_CONTAINER,
			}),
		);
	};

	/**
	 * Drags a resize handle from a point of the container by screen pixels. Konva's handles follow
	 * mouse events on the window, so these are sent along with the pointer events.
	 */
	const dragHandle = async (
		[startX, startY]: PlanDocument.Point,
		[deltaX, deltaY]: PlanDocument.Point,
	) => {
		await nextFrame();
		const rect = container.getBoundingClientRect();
		const at = (x: number, y: number) => ({
			bubbles: true,
			cancelable: true,
			pointerId: 1,
			pointerType: "mouse",
			isPrimary: true,
			button: 0,
			buttons: 1,
			clientX: rect.left + x,
			clientY: rect.top + y,
		});
		konvaContent(container).dispatchEvent(
			new PointerEvent("pointerdown", at(startX, startY)),
		);
		konvaContent(container).dispatchEvent(
			new MouseEvent("mousedown", at(startX, startY)),
		);
		for (const step of [0.5, 1]) {
			const point = at(startX + deltaX * step, startY + deltaY * step);
			window.dispatchEvent(new PointerEvent("pointermove", point));
			window.dispatchEvent(new MouseEvent("mousemove", point));
		}
		const end = { ...at(startX + deltaX, startY + deltaY), buttons: 0 };
		window.dispatchEvent(new PointerEvent("pointerup", end));
		window.dispatchEvent(new MouseEvent("mouseup", end));
		await nextFrame();
	};

	return {
		canvas,
		container,
		editor,
		selection,
		tools,
		fire,
		drag,
		rightClick,
		dragHandle,
		onContextMenu,
	};
}

describe("PlanCanvas drawing tools", () => {
	test("the rectangle tool spans a rectangle in map coordinates, one undo step", async () => {
		const { editor, tools, drag } = setUp();
		tools.set({ tool: "rectangle", color: "#ff4d4d", size: "L" });

		await drag([
			[100, 100],
			[300, 200],
			[500, 300],
		]);

		expect(editor.getDocument().drawings).toMatchObject([
			{
				type: "rectangle",
				color: "#ff4d4d",
				size: "L",
				from: [100, 100],
				to: [500, 300],
			},
		]);
		editor.undo();
		expect(editor.getDocument().drawings).toEqual([]);
	});

	test("a click with a shape tool draws nothing", async () => {
		const { editor, tools, drag } = setUp();
		tools.set({ tool: "arrow" });

		await drag([[100, 100]]);

		expect(editor.getDocument().drawings).toEqual([]);
	});

	test("the pen draws a stroke through the pointer's points", async () => {
		const { editor, tools, drag } = setUp();
		tools.set({ tool: "pen" });

		await drag([
			[100, 100],
			[140, 120],
			[200, 180],
		]);

		expect(editor.getDocument().drawings).toMatchObject([
			{
				type: "stroke",
				points: [
					[100, 100],
					[140, 120],
					[200, 180],
				],
			},
		]);
	});

	test("the pen draws over a token without moving or selecting it", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.slots[0] = { ...PlanDocument.newPlayer(40), position: [600, 600] };
		const { editor, selection, tools, drag } = setUp(plan);
		tools.set({ tool: "pen" });

		await drag([
			[600, 600],
			[700, 600],
		]);

		expect(editor.getDocument().slots[0]?.position).toEqual([600, 600]);
		expect(selection.get()).toBeNull();
		expect(editor.getDocument().drawings).toHaveLength(1);
	});

	test("another tool than select takes the selected player out of the selection", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.slots[0] = { ...PlanDocument.newPlayer(40), position: [600, 600] };
		const { selection, tools } = setUp(plan);
		selection.set({ type: "player", slot: 0 });

		tools.set({ tool: "pen" });

		expect(selection.get()).toBeNull();
	});

	test("selecting a player takes the select tool", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.slots[0] = { ...PlanDocument.newPlayer(40), position: [600, 600] };
		const { selection, tools } = setUp(plan);
		tools.set({ tool: "pen" });

		selection.set({ type: "player", slot: 0 });

		expect(tools.get().tool).toBe("select");
	});

	test("a right click on a token with the pen opens its menu without selecting it", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.slots[0] = { ...PlanDocument.newPlayer(40), position: [600, 600] };
		const { selection, tools, rightClick, onContextMenu } = setUp(plan);
		tools.set({ tool: "pen" });

		await rightClick([600, 600]);

		expect(onContextMenu).toHaveBeenCalledWith(
			{ type: "player", slot: 0 },
			expect.any(Array),
		);
		expect(selection.get()).toBeNull();
		expect(tools.get().tool).toBe("pen");
	});

	test("the eraser removes every drawing it passes over, one undo step", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE, LINE];
		const { editor, tools, drag } = setUp(plan);
		tools.set({ tool: "eraser" });

		await drag([
			[300, 150],
			[300, 400],
			[1200, 500],
			[1200, 700],
		]);

		expect(editor.getDocument().drawings).toEqual([]);
		editor.undo();
		expect(editor.getDocument().drawings).toEqual([RECTANGLE, LINE]);
	});

	test("the text tool types a label where it is clicked", async () => {
		const { container, editor, tools, drag } = setUp();
		tools.set({ tool: "text", color: "#3ddc84" });

		await drag([[400, 300]]);
		const field = container.querySelector<HTMLTextAreaElement>(
			"[data-testid='plan-text-field']",
		);
		expect(field).not.toBeNull();
		await vi.waitFor(() => expect(document.activeElement).toBe(field));
		await userEvent.keyboard("push{Enter}");

		expect(editor.getDocument().drawings).toMatchObject([
			{ type: "text", text: "push", color: "#3ddc84", position: [400, 300] },
		]);
		expect(container.querySelector("textarea")).toBeNull();
	});
});

describe("PlanCanvas text labels", () => {
	test("a label being typed takes the colour and size picked meanwhile", async () => {
		const { container, editor, tools, drag } = setUp();
		tools.set({ tool: "text" });

		await drag([[400, 300]]);
		const field = container.querySelector("textarea");
		await vi.waitFor(() => expect(document.activeElement).toBe(field));
		await userEvent.keyboard("go");
		tools.set({ color: "#ff4d4d", size: "L" });
		expect(field?.style.color).toBe("rgb(255, 77, 77)");
		await userEvent.keyboard("{Enter}");

		expect(editor.getDocument().drawings).toMatchObject([
			{ type: "text", text: "go", color: "#ff4d4d", size: "L" },
		]);
	});

	test("a label opened with the text tool is selected while edited, so its style can be picked", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [LABEL];
		const { container, editor, selection, tools, drag } = setUp(plan);
		tools.set({ tool: "text" });

		await drag([[420, 320]]);
		const field = container.querySelector("textarea");
		await vi.waitFor(() => expect(document.activeElement).toBe(field));
		expect(selection.get()).toEqual({ type: "drawings", ids: ["label"] });

		editor.apply({
			type: "updateDrawing",
			id: "label",
			patch: { color: "#3ddc84" },
		});
		expect(field?.style.color).toBe("rgb(61, 220, 132)");
		await userEvent.keyboard("{Enter}");

		expect(editor.getDocument().drawings).toEqual([
			{ ...LABEL, color: "#3ddc84" },
		]);
		expect(selection.get()).toBeNull();
	});
});

describe("PlanCanvas text field", () => {
	/** Opens the label for editing the way the select tool does, by double clicking it. */
	async function openLabel() {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [LABEL];
		const context = setUp(plan);
		await nextFrame();
		const rect = context.container.getBoundingClientRect();
		konvaContent(context.container).dispatchEvent(
			new MouseEvent("dblclick", {
				bubbles: true,
				clientX: rect.left + 420 / MAP_TO_CONTAINER,
				clientY: rect.top + 320 / MAP_TO_CONTAINER,
			}),
		);
		const field = context.container.querySelector("textarea")!;
		await vi.waitFor(() => expect(document.activeElement).toBe(field));
		return { ...context, field };
	}

	test("Escape throws a new label away, leaving no undo step", async () => {
		const { container, editor, tools, drag } = setUp();
		tools.set({ tool: "text" });

		await drag([[400, 300]]);
		await vi.waitFor(() =>
			expect(document.activeElement?.tagName).toBe("TEXTAREA"),
		);
		await userEvent.keyboard("go{Escape}");

		expect(editor.getDocument().drawings).toEqual([]);
		expect(editor.canUndo()).toBe(false);
		expect(container.querySelector("textarea")).toBeNull();
	});

	test("clicking away saves the label as one undo step", async () => {
		const { editor, field } = await openLabel();

		await userEvent.keyboard("hold");
		field.blur();

		expect(editor.getDocument().drawings).toEqual([{ ...LABEL, text: "hold" }]);
		editor.undo();
		expect(editor.getDocument().drawings).toEqual([LABEL]);
	});

	test("a label left blank is removed, Undo brings it back", async () => {
		const { editor } = await openLabel();

		await userEvent.keyboard("{Backspace}{Enter}");

		expect(editor.getDocument().drawings).toEqual([]);
		editor.undo();
		expect(editor.getDocument().drawings).toEqual([LABEL]);
	});

	test("a press in the field is left to it, the label not moving", async () => {
		const { editor, field } = await openLabel();
		const rect = field.getBoundingClientRect();
		const init = {
			bubbles: true,
			pointerId: 1,
			pointerType: "mouse",
			button: 0,
			buttons: 1,
			clientX: rect.left + 2,
			clientY: rect.top + 2,
		};
		field.dispatchEvent(new PointerEvent("pointerdown", init));
		field.dispatchEvent(
			new PointerEvent("pointermove", { ...init, clientX: init.clientX + 30 }),
		);
		field.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));

		expect(editor.getDocument().drawings).toEqual([LABEL]);
		expect(document.activeElement).toBe(field);
	});
});

describe("PlanCanvas resize handles", () => {
	test("dragging a rectangle's corner resizes it, one undo step", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE];
		const { editor, selection, dragHandle } = setUp(plan);
		selection.set({ type: "drawings", ids: ["rect"] });

		await dragHandle(
			[
				400 / MAP_TO_CONTAINER + HANDLE_OFFSET,
				300 / MAP_TO_CONTAINER + HANDLE_OFFSET,
			],
			[20, 20],
		);

		const resized = editor.getDocument().drawings[0];
		expect(resized).toMatchObject({ from: [200, 200] });
		const [toX, toY] = resized.type === "rectangle" ? resized.to : [0, 0];
		expect(Math.abs(toX - 500)).toBeLessThanOrEqual(1);
		expect(Math.abs(toY - 400)).toBeLessThanOrEqual(1);
		editor.undo();
		expect(editor.getDocument().drawings).toEqual([RECTANGLE]);
	});

	test("dragging a label's corner scales it from the opposite corner, one undo step", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [LABEL];
		const { editor, selection, dragHandle } = setUp(plan);
		selection.set({ type: "drawings", ids: ["label"] });

		await dragHandle(
			[
				400 / MAP_TO_CONTAINER - HANDLE_OFFSET,
				300 / MAP_TO_CONTAINER - HANDLE_OFFSET,
			],
			[-10, -10],
		);

		const scaled = editor.getDocument().drawings[0];
		expect(scaled.type === "text" ? scaled.scale : null).toBeGreaterThan(1);
		const [x, y] = scaled.type === "text" ? scaled.position : [0, 0];
		expect(x).toBeLessThan(400);
		expect(y).toBeLessThan(300);
		editor.undo();
		expect(editor.getDocument().drawings).toEqual([LABEL]);
	});
});

describe("PlanCanvas select tool", () => {
	test("a click selects a drawing, Shift+click adds another", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE, LINE];
		const { selection, drag } = setUp(plan);

		await drag([[200, 250]]);
		expect(selection.get()).toEqual({ type: "drawings", ids: ["rect"] });

		await drag([[1200, 600]], { shiftKey: true });
		expect(selection.get()).toEqual({
			type: "drawings",
			ids: ["rect", "line"],
		});
	});

	test("a box selects the drawings it touches", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE, LINE];
		const { selection, drag } = setUp(plan);

		await drag([
			[350, 100],
			[700, 400],
			[1100, 650],
		]);

		expect(selection.get()).toEqual({
			type: "drawings",
			ids: ["rect", "line"],
		});

		await drag([[1800, 1000]]);
		expect(selection.get()).toBeNull();
	});

	test("dragging a selected drawing moves the selection, one undo step", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE, LINE];
		const { editor, selection, drag } = setUp(plan);
		selection.set({ type: "drawings", ids: ["rect", "line"] });

		await drag([
			[1200, 600],
			[1220, 620],
			[1300, 700],
		]);

		expect(editor.getDocument().drawings).toMatchObject([
			{ from: [300, 300], to: [500, 400] },
			{ from: [1100, 700], to: [1500, 700] },
		]);
		editor.undo();
		expect(editor.getDocument().drawings).toEqual([RECTANGLE, LINE]);
	});

	test("a right click on a drawing selects it and opens its menu", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE, LINE];
		const { selection, rightClick, onContextMenu } = setUp(plan);

		await rightClick([200, 250]);

		expect(selection.get()).toEqual({ type: "drawings", ids: ["rect"] });
		expect(onContextMenu).toHaveBeenCalledWith(
			{ type: "drawings", ids: ["rect"] },
			expect.any(Array),
		);
	});

	test("a right click on a selected drawing opens the menu of the whole selection", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE, LINE];
		const { selection, rightClick, onContextMenu } = setUp(plan);
		selection.set({ type: "drawings", ids: ["rect", "line"] });

		await rightClick([1200, 600]);

		expect(onContextMenu).toHaveBeenCalledWith(
			{ type: "drawings", ids: ["rect", "line"] },
			expect.any(Array),
		);
	});

	test("a long press on a drawing opens its menu instead of moving it", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE];
		const { editor, selection, fire, onContextMenu } = setUp(plan);
		const touch = { pointerType: "touch" };
		await nextFrame();

		fire("pointerdown", [200, 250], touch);
		await waitForLongPress();
		fire("pointermove", [300, 350], touch);
		fire("pointerup", [300, 350], touch);

		expect(selection.get()).toEqual({ type: "drawings", ids: ["rect"] });
		expect(onContextMenu).toHaveBeenCalledWith(
			{ type: "drawings", ids: ["rect"] },
			expect.any(Array),
		);
		expect(editor.getDocument().drawings).toEqual([RECTANGLE]);
	});

	test("a second finger landing cancels the long press", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE];
		const { fire, onContextMenu } = setUp(plan);
		await nextFrame();

		fire("pointerdown", [200, 250], { pointerType: "touch" });
		fire("pointerdown", [600, 600], { pointerType: "touch", pointerId: 2 });
		await waitForLongPress();

		expect(onContextMenu).not.toHaveBeenCalled();
	});

	test("a right click on the empty map opens no menu", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE];
		const { rightClick, onContextMenu } = setUp(plan);

		await rightClick([1500, 900]);

		expect(onContextMenu).not.toHaveBeenCalled();
	});

	test("a double click on a token over a label doesn't edit the label", async () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [LABEL];
		plan.slots[0] = { ...PlanDocument.newPlayer(40), position: [420, 320] };
		const { container } = setUp(plan);
		await nextFrame();
		const rect = container.getBoundingClientRect();

		konvaContent(container).dispatchEvent(
			new MouseEvent("dblclick", {
				bubbles: true,
				clientX: rect.left + 420 / MAP_TO_CONTAINER,
				clientY: rect.top + 320 / MAP_TO_CONTAINER,
			}),
		);

		expect(container.querySelector("textarea")).toBeNull();
	});

	test("taking another tool clears the selected drawings", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [RECTANGLE];
		const { selection, tools } = setUp(plan);
		selection.set({ type: "drawings", ids: ["rect"] });

		tools.set({ tool: "pen" });

		expect(selection.get()).toBeNull();
	});

	test("undoing a drawing drops it from the selection", async () => {
		const { editor, selection, tools, drag } = setUp();
		tools.set({ tool: "line" });
		await drag([
			[100, 100],
			[300, 300],
		]);
		tools.set({ tool: "select" });
		const id = editor.getDocument().drawings[0].id;
		selection.set({ type: "drawings", ids: [id] });

		editor.undo();

		expect(selection.get()).toBeNull();
	});
});

describe("PlanCanvas.exportImage", () => {
	test("is the whole map at the render's size, whatever the zoom", async () => {
		const { canvas, container } = setUp({
			...PlanDocument.empty({ stageId: 0, mode: "SZ" }),
			drawings: [LINE],
		});
		await nextFrame();
		container.dispatchEvent(
			new WheelEvent("wheel", {
				bubbles: true,
				cancelable: true,
				deltaY: -400,
				clientX: container.getBoundingClientRect().left + 10,
				clientY: container.getBoundingClientRect().top + 10,
			}),
		);

		const pixels = await pixelsOf(await canvas.exportImage());

		expect([pixels.width, pixels.height]).toEqual([
			PlanDocument.MAP_SIZE.width,
			PlanDocument.MAP_SIZE.height,
		]);
		expect(pixels.at([1200, 600])).toEqual([255, 77, 77, 255]);
		expect(pixels.at([1200, 640])[3]).toBe(0);
	});

	test("saves a label being typed into it", async () => {
		const { canvas, container, tools, drag, editor } = setUp();
		tools.set({ tool: "text" });
		await drag([[400, 300]]);
		const field = container.querySelector("textarea");
		await vi.waitFor(() => expect(document.activeElement).toBe(field));
		await userEvent.keyboard("push");

		await canvas.exportImage();

		expect(editor.getDocument().drawings).toMatchObject([{ text: "push" }]);
	});
});

async function pixelsOf(blob: Blob) {
	const bitmap = await createImageBitmap(blob);
	const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext(
		"2d",
	)!;
	context.drawImage(bitmap, 0, 0);

	return {
		width: bitmap.width,
		height: bitmap.height,
		at: ([x, y]: PlanDocument.Point) => [
			...context.getImageData(x, y, 1, 1).data,
		],
	};
}

function konvaContent(container: HTMLElement) {
	return container.querySelector<HTMLElement>(".konvajs-content") ?? container;
}

function nextFrame() {
	return new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Longer than a press has to be held to count as a long press. */
function waitForLongPress() {
	return new Promise((resolve) => setTimeout(resolve, 600));
}
