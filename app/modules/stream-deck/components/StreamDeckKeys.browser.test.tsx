import { Clock } from "lucide-react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import type * as StreamDeck from "../stream-deck";
import { streamDeckAutoConnectPersisted } from "../stream-deck-persisted";
import { StreamDeckKeys } from "./StreamDeckKeys";
import { StreamDeckSetup } from "./StreamDeckSetup";

const IMAGE_REPORT_ID = 0x02;
const KEY_INPUT_OFFSET = 3;
const KEY_COUNT = 15;

/** A Stream Deck MK.2 as WebHID hands it over, about as slow as the real one, so opening and closing can race. */
class FakeHidDevice extends EventTarget {
	vendorId = 0x0fd9;
	productId = 0x80;
	productName = "Stream Deck MK.2";
	opened = false;
	collections = [];
	imageReports: Uint8Array[] = [];
	openCount = 0;
	/** Writes fail while on, as when another app holds the deck. */
	isFailingWrites = false;

	async open() {
		if (this.opened) {
			throw new DOMException(
				"The device is already open.",
				"InvalidStateError",
			);
		}
		this.opened = true;
		this.openCount++;
	}

	async close() {
		await wait(30);
		this.opened = false;
	}

	async forget() {
		await this.close();
	}

	async sendReport(reportId: number, data: Uint8Array) {
		await wait(1);
		if (!this.opened) throw new DOMException("closed", "InvalidStateError");
		if (this.isFailingWrites) throw new Error("write failed");
		if (reportId === IMAGE_REPORT_ID)
			this.imageReports.push(new Uint8Array(data));
	}

	async sendFeatureReport() {
		await wait(5);
		if (!this.opened) throw new DOMException("closed", "InvalidStateError");
	}

	async receiveFeatureReport() {
		return new DataView(new ArrayBuffer(32));
	}

	/** How many different keys were drawn since the last {@link forgetDrawn}. */
	drawnKeyCount() {
		return new Set(this.imageReports.map((report) => report[1])).size;
	}

	forgetDrawn() {
		this.imageReports = [];
	}

	press(keyIndex: number) {
		const data = new Uint8Array(32);
		data[KEY_INPUT_OFFSET + keyIndex] = 1;
		this.dispatchEvent(
			Object.assign(new Event("inputreport"), {
				reportId: 0x01,
				data: new DataView(data.buffer),
			}),
		);
	}
}

const device = new FakeHidDevice();
const pressed: number[] = [];

Object.defineProperty(navigator, "hid", {
	configurable: true,
	value: Object.assign(new EventTarget(), {
		getDevices: async () => [device],
		requestDevice: async () => [device],
	}),
});

describe("StreamDeckKeys", () => {
	beforeEach(() => {
		PersistedState.write(streamDeckAutoConnectPersisted, true);
		pressed.length = 0;
	});

	afterEach(() => {
		device.forgetDrawn();
		device.isFailingWrites = false;
	});

	test("connects a deck allowed before and draws every key", async () => {
		const screen = await render(<Page />);

		await expectEveryKeyDrawn();
		await expect
			.element(screen.getByText("Stream Deck MK.2 connected"))
			.toBeVisible();
	});

	test("draws the keys again on coming back to the page, keeping the deck open", async () => {
		const first = await render(<Page />);
		await expect.poll(() => device.opened).toBe(true);
		await first.unmount();

		const openCount = device.openCount;
		device.forgetDrawn();
		await render(<Page />);

		await expectEveryKeyDrawn();
		expect(device.opened).toBe(true);
		expect(device.openCount).toBe(openCount);
	});

	test("does what the pressed key does", async () => {
		await render(<Page />);
		await expectEveryKeyDrawn();

		device.press(14);
		device.press(5);

		expect(pressed).toEqual([14, 5]);
	});

	test("pressing a disabled key does nothing", async () => {
		await render(<Page disabledKeyIndex={0} />);
		await expectEveryKeyDrawn();

		device.press(0);

		expect(pressed).toEqual([]);
	});

	test("tells a failed draw and draws the key again once writing works", async () => {
		device.isFailingWrites = true;
		const screen = await render(<Page />);

		await expect
			.element(screen.getByText(/Couldn't draw on the Stream Deck/))
			.toBeVisible();
		expect(device.drawnKeyCount()).toBe(0);

		device.isFailingWrites = false;
		await screen.rerender(<Page />);

		await expectEveryKeyDrawn();
		await expect
			.element(screen.getByText(/Couldn't draw on the Stream Deck/))
			.not.toBeInTheDocument();
	});

	test("disconnecting closes the deck until connected again", async () => {
		const screen = await render(<Page />);
		await expectEveryKeyDrawn();

		device.forgetDrawn();
		await screen.getByRole("button", { name: "Disconnect" }).click();
		await expect.poll(() => device.opened).toBe(false);
		await screen.unmount();

		const later = await render(<Page />);
		await expect
			.element(later.getByRole("button", { name: "Connect Stream Deck" }))
			.toBeVisible();
		expect(device.opened).toBe(false);

		device.forgetDrawn();
		await later.getByRole("button", { name: "Connect Stream Deck" }).click();
		await expectEveryKeyDrawn();
	});
});

function Page({ disabledKeyIndex }: { disabledKeyIndex?: number }) {
	const faces = Array.from(
		{ length: KEY_COUNT },
		(_, idx): StreamDeck.KeyFace => ({
			icon: Clock,
			label: `Key ${idx}`,
			isDisabled: idx === disabledKeyIndex,
		}),
	);

	return (
		<>
			<StreamDeckKeys
				faces={faces}
				onPress={(keyIndex) => pressed.push(keyIndex)}
			/>
			<StreamDeckSetup faces={faces}>
				Run things from a Stream Deck.
			</StreamDeckSetup>
		</>
	);
}

// each key goes through the browser's async JPEG encoding, slow while the whole suite runs at once
function expectEveryKeyDrawn() {
	return expect
		.poll(() => device.drawnKeyCount(), { timeout: 5000 })
		.toBe(KEY_COUNT);
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
