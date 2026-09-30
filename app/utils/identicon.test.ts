import { describe, expect, test } from "vitest";
import { generateIdenticon } from "./identicon";

const CELL_SIZE = 2;
const MIN_MARGIN = 4;

describe("generateIdenticon", () => {
	test("returns the same data url for the same input", () => {
		expect(generateIdenticon("79237403620945920")).toBe(
			generateIdenticon("79237403620945920"),
		);
	});

	test("returns different data urls for different inputs", () => {
		expect(generateIdenticon("Alliance Rogue")).not.toBe(
			generateIdenticon("Team Olive"),
		);
	});

	test("returns a url safe svg data url", () => {
		const dataUrl = generateIdenticon("Chimera");

		expect(dataUrl.startsWith("data:image/svg+xml,")).toBe(true);
		expect(dataUrl).not.toMatch(/[<>"\s]/);
		expect(decodeURIComponent(dataUrl)).toContain("<svg");
	});

	test("mirrors the pattern horizontally", () => {
		const dataUrl = generateIdenticon("Sendou");
		const cells = Array.from(
			patternPathOf(dataUrl).matchAll(/M(\d+),(\d+)h(\d+)/g),
			([, x, y]) => `${x},${y}`,
		);

		expect(cells.length).toBeGreaterThan(0);

		for (const cell of cells) {
			const [x, y] = cell.split(",").map(Number);
			expect(cells).toContain(`${viewBoxSizeOf(dataUrl) - CELL_SIZE - x},${y}`);
		}
	});

	test.each([
		"Melisa",
		"صبري",
		"S",
		"Аристарх",
		"burdensome dusk",
		"Alliance Rogue",
		"79237403620945920",
	])("centers the pattern in the view box (%s)", (input) => {
		const dataUrl = generateIdenticon(input);
		const bounds = patternBoundsOf(dataUrl);
		const viewBoxSize = viewBoxSizeOf(dataUrl);

		expect(bounds.minX).toBe(viewBoxSize - bounds.maxX);
		expect(bounds.minY).toBe(viewBoxSize - bounds.maxY);
	});

	test("leaves a margin around the pattern", () => {
		const dataUrl = generateIdenticon("Sendou");
		const bounds = patternBoundsOf(dataUrl);

		expect(bounds.minX).toBeGreaterThanOrEqual(MIN_MARGIN);
		expect(bounds.minY).toBeGreaterThanOrEqual(MIN_MARGIN);
	});
});

function patternPathOf(dataUrl: string) {
	const paths = decodeURIComponent(dataUrl).match(/d='[^']+'/g);

	return paths!.at(-1)!;
}

function patternBoundsOf(dataUrl: string) {
	const cells = Array.from(
		patternPathOf(dataUrl).matchAll(/M(\d+),(\d+)h/g),
		([, x, y]) => ({ x: Number(x), y: Number(y) }),
	);

	return {
		minX: Math.min(...cells.map((cell) => cell.x)),
		maxX: Math.max(...cells.map((cell) => cell.x)) + CELL_SIZE,
		minY: Math.min(...cells.map((cell) => cell.y)),
		maxY: Math.max(...cells.map((cell) => cell.y)) + CELL_SIZE,
	};
}

function viewBoxSizeOf(dataUrl: string) {
	return Number(decodeURIComponent(dataUrl).match(/viewBox='0 0 (\d+)/)![1]);
}
