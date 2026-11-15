import type { StreamDeckWeb } from "@elgato-stream-deck/webhid";
import type { LucideIcon } from "lucide-react";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { streamDeckAutoConnectPersisted } from "./stream-deck-persisted";

/** Keys per row of the supported Stream Decks. */
export const COLUMNS = 5;

/** Rows of the supported Stream Decks. */
const ROWS = 3;

/** Width and height in pixels of one key's screen on the supported Stream Decks. */
const KEY_SIZE_PX = 72;

/** The background colors a key can have. */
const KEY_COLORS = {
	neutral: "#25272e",
	red: "#c62828",
	green: "#2e7d32",
	orange: "#e65100",
	blue: "#1565c0",
} as const;

/** Background of a disabled key, whatever its color. */
const KEY_DISABLED_COLOR = "#121317";

const KEY_SELECTED_BORDER = "#ffffff";
const ELGATO_VENDOR_ID = 0x0fd9;

/** What one key shows: an icon over a label, and a short detail under it (a countdown, a score). */
export interface KeyFace {
	icon: LucideIcon;
	label: string;
	detail?: string | null;
	/** Defaults to `neutral`. */
	color?: keyof typeof KEY_COLORS;
	/** A white border, e.g. the option currently picked. */
	isSelected?: boolean;
	/** Dimmed, pressing it does nothing. */
	isDisabled?: boolean;
}

/** The browser's `HIDDevice`, only what is used of it. */
interface HidDevice {
	vendorId: number;
	productId: number;
	opened: boolean;
	close(): Promise<void>;
}

interface WebHid extends EventTarget {
	getDevices(): Promise<HidDevice[]>;
	requestDevice(options: {
		filters: Array<{ vendorId: number }>;
	}): Promise<HidDevice[]>;
}

/** An open Stream Deck. */
export interface Connection {
	device: HidDevice;
	deck: StreamDeckWeb;
	/** The model, e.g. "Stream Deck MK.2". */
	name: string;
}

type Problem =
	| { type: "unsupportedModel"; name: string }
	| { type: "openFailed" }
	| { type: "drawFailed"; message: string };

export interface State {
	connection: Connection | null;
	problem: Problem | null;
}

export const NO_DECK: State = { connection: null, problem: null };

// one connection per browser tab that outlives the page using it: opening and closing the device on every visit
// raced, a page leaving closed the device the next one had just opened
let state = NO_DECK;
const listeners = new Set<() => void>();
let operations: Promise<unknown> = Promise.resolve();
let isWatchingDevices = false;

/** The browser's WebHID (Chromium only), `null` without it. */
export function webHid() {
	if (typeof navigator === "undefined" || !("hid" in navigator)) return null;

	return navigator.hid as WebHid;
}

/** The Stream Deck connected in this tab, for `useSyncExternalStore` with {@link subscribe}. */
export function current() {
	return state;
}

/** Calls `listener` whenever the {@link current} state changes. Returns the unsubscribe function. */
export function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Starts connecting the Stream Deck allowed before by itself, now and whenever it is plugged in, unless the user
 * disconnected it. Safe to call any number of times.
 */
export function watchDevices() {
	const hid = webHid();
	if (!hid || isWatchingDevices) return;
	isWatchingDevices = true;

	const autoConnect = (devices: HidDevice[]) =>
		serialized(async () => {
			if (
				state.connection ||
				!PersistedState.read(streamDeckAutoConnectPersisted)
			) {
				return;
			}

			setState(await openSupported(devices));
		});

	void hid.getDevices().then(autoConnect);
	hid.addEventListener(
		"connect",
		(event) => void autoConnect([deviceOf(event)]),
	);
	hid.addEventListener("disconnect", (event) => {
		if (deviceOf(event) === state.connection?.device) setState(NO_DECK);
	});
}

/** Shows the browser's device picker and connects the Stream Deck picked. Call it straight from a click. */
export async function connect() {
	const hid = webHid();
	if (!hid) return;

	// before anything is awaited, the browser only shows its device picker for a click that just happened
	const devices = await hid
		.requestDevice({ filters: [{ vendorId: ELGATO_VENDOR_ID }] })
		.catch(() => []);
	if (devices.length === 0) return;

	PersistedState.write(streamDeckAutoConnectPersisted, true);
	await serialized(async () => {
		await close(state.connection);
		setState(await openSupported(devices));
	});
}

/** Blanks and closes the Stream Deck. It doesn't connect by itself again until {@link connect}ed. */
export async function disconnect() {
	PersistedState.write(streamDeckAutoConnectPersisted, false);
	await serialized(async () => {
		await close(state.connection);
		setState(NO_DECK);
	});
}

/**
 * Shows `canvas` on the key at `keyIndex` (counted from the top left, row by row) while `connection` is still the
 * connected deck. Throws when the deck refuses it.
 */
export function fillKey(
	connection: Connection,
	keyIndex: number,
	canvas: HTMLCanvasElement,
) {
	return serialized(async () => {
		if (state.connection !== connection) return;

		const control = connection.deck.CONTROLS.find(
			(candidate) =>
				candidate.type === "button" &&
				candidate.row * COLUMNS + candidate.column === keyIndex,
		);
		if (!control) return;

		await connection.deck.fillKeyCanvas(control.index, canvas);
	});
}

/** Blanks every key while `connection` is still the connected deck. */
export function clearKeys(connection: Connection) {
	return serialized(async () => {
		if (state.connection !== connection) return;

		await connection.deck.clearPanel();
	}).catch(() => undefined);
}

/** Tells (or with `null` stops telling) that the keys couldn't be drawn. */
export function reportDrawFailed(message: string | null) {
	if (message !== null) {
		setState({ ...state, problem: { type: "drawFailed", message } });
	} else if (state.problem?.type === "drawFailed") {
		setState({ ...state, problem: null });
	}
}

/**
 * Whether the device's keys are the 15 key screens in {@link ROWS} rows of {@link COLUMNS} this module supports,
 * e.g. Stream Deck MK.2 and the original Stream Deck. Takes the model's `controls`.
 * @internal
 */
export function isSupported(
	controls: ReadonlyArray<{
		type: string;
		row: number;
		column: number;
		feedbackType?: string;
		pixelSize?: { width: number; height: number };
	}>,
) {
	return (
		controls.length === ROWS * COLUMNS &&
		controls.every(
			(control) =>
				control.type === "button" &&
				control.feedbackType === "lcd" &&
				control.row < ROWS &&
				control.column < COLUMNS &&
				control.pixelSize?.width === KEY_SIZE_PX &&
				control.pixelSize.height === KEY_SIZE_PX,
		)
	);
}

/** The key as the deck shows it: icon over label over detail, a white border when selected, dimmed when disabled. */
export async function drawKey(face: KeyFace, iconSvg: string) {
	const size = KEY_SIZE_PX;
	const iconSize = 28;
	const icon = await loadSvg(iconSvg);
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;

	const fontFamily = getComputedStyle(document.body).fontFamily;
	const hasDetail = Boolean(face.detail);

	ctx.fillStyle = keyBackground(face);
	ctx.fillRect(0, 0, size, size);
	if (face.isSelected) {
		ctx.strokeStyle = KEY_SELECTED_BORDER;
		ctx.lineWidth = 6;
		ctx.strokeRect(3, 3, size - 6, size - 6);
	}

	ctx.globalAlpha = face.isDisabled ? 0.35 : 1;
	ctx.drawImage(
		icon,
		(size - iconSize) / 2,
		hasDetail ? 8 : 12,
		iconSize,
		iconSize,
	);
	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	fillFittedText(ctx, face.label, {
		y: hasDetail ? 46 : 54,
		fontPx: 14,
		fontWeight: 700,
		fontFamily,
	});
	if (face.detail) {
		fillFittedText(ctx, face.detail, {
			y: 61,
			fontPx: 12,
			fontWeight: 600,
			fontFamily,
		});
	}

	return canvas;
}

/** The key's background color, as {@link drawKey} draws it. */
export function keyBackground(face: KeyFace) {
	return face.isDisabled
		? KEY_DISABLED_COLOR
		: KEY_COLORS[face.color ?? "neutral"];
}

function setState(next: State) {
	if (
		next.connection === state.connection &&
		JSON.stringify(next.problem) === JSON.stringify(state.problem)
	) {
		return;
	}

	state = next;
	for (const listener of listeners) listener();
}

/** Runs device operations one at a time, so a device never opens while it is closing and nothing draws on a closed one. */
function serialized<T>(operation: () => Promise<T>): Promise<T> {
	const result = operations.then(operation);
	operations = result.catch(() => undefined);

	return result;
}

function deviceOf(event: Event) {
	return (event as Event & { device: HidDevice }).device;
}

/** Opens the first of `devices` that is a supported Stream Deck, telling why none opened otherwise. */
async function openSupported(devices: HidDevice[]): Promise<State> {
	const { findModelByUsb, openDevice } = await import(
		"@elgato-stream-deck/webhid"
	);
	let problem: Problem | null = null;

	for (const device of devices) {
		const model = findModelByUsb(device.vendorId, device.productId);
		if (!model) continue;
		if (!isSupported(model.controls)) {
			problem = { type: "unsupportedModel", name: model.name };
			continue;
		}

		try {
			// left open by a connection that was lost
			if (device.opened) await device.close();
			const deck = await openDevice(device);
			return { connection: { device, deck, name: model.name }, problem: null };
		} catch {
			problem = { type: "openFailed" };
		}
	}

	return { connection: null, problem };
}

async function close(connection: Connection | null) {
	if (!connection?.device.opened) return;

	await connection.deck.clearPanel().catch(() => null);
	await connection.deck.close().catch(() => null);
}

/** Fills the text centered on the key, in a smaller font if it doesn't fit its width. */
function fillFittedText(
	ctx: CanvasRenderingContext2D,
	text: string,
	{
		y,
		fontPx,
		fontWeight,
		fontFamily,
	}: { y: number; fontPx: number; fontWeight: number; fontFamily: string },
) {
	const maxWidth = KEY_SIZE_PX - 10;
	let px = fontPx;
	do {
		ctx.font = `${fontWeight} ${px}px ${fontFamily}`;
		px--;
	} while (px >= 8 && ctx.measureText(text).width > maxWidth);

	ctx.fillText(text, KEY_SIZE_PX / 2, y, maxWidth);
}

const svgImages = new Map<string, Promise<HTMLImageElement>>();

function loadSvg(svg: string) {
	let image = svgImages.get(svg);
	if (!image) {
		const element = new Image();
		element.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
		image = element.decode().then(
			() => element,
			(error) => {
				svgImages.delete(svg);
				throw error;
			},
		);
		svgImages.set(svg, image);
	}

	return image;
}
