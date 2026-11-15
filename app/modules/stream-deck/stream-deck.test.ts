import { Clock } from "lucide-react";
import { describe, expect, test } from "vitest";
import * as StreamDeck from "./stream-deck";

describe("StreamDeck.isSupported", () => {
	const button = (row: number, column: number, size = 72) => ({
		type: "button",
		feedbackType: "lcd",
		row,
		column,
		pixelSize: { width: size, height: size },
	});
	const grid = (rows: number, columns: number, size?: number) =>
		Array.from({ length: rows * columns }, (_, idx) =>
			button(Math.floor(idx / columns), idx % columns, size),
		);

	test.each([
		{ why: "3 rows of 5 (MK.2)", controls: grid(3, 5), expected: true },
		{ why: "2 rows of 3 (Mini)", controls: grid(2, 3), expected: false },
		{ why: "4 rows of 8 (XL)", controls: grid(4, 8), expected: false },
		{ why: "5 rows of 3", controls: grid(5, 3), expected: false },
		{ why: "keys of another size", controls: grid(3, 5, 96), expected: false },
	])("$why: $expected", ({ controls, expected }) => {
		expect(StreamDeck.isSupported(controls)).toBe(expected);
	});
});

describe("StreamDeck.keyBackground", () => {
	const background = (face: Partial<StreamDeck.KeyFace>) =>
		StreamDeck.keyBackground({ icon: Clock, label: "", ...face });

	test("is neutral without a color", () => {
		expect(background({})).toBe(background({ color: "neutral" }));
	});

	test("follows the color", () => {
		expect(background({ color: "red" })).not.toBe(background({}));
	});

	test("is the same for every disabled key, whatever its color", () => {
		expect(background({ color: "green", isDisabled: true })).toBe(
			background({ isDisabled: true }),
		);
		expect(background({ isDisabled: true })).not.toBe(background({}));
	});
});
