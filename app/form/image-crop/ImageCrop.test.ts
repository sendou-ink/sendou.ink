import { describe, expect, test } from "vitest";
import * as ImageCrop from "./ImageCrop";

const landscape: ImageCrop.CropBounds = {
	imageSize: { width: 4000, height: 2000 },
	aspectRatio: 1,
};
const bannerOfPortrait: ImageCrop.CropBounds = {
	imageSize: { width: 1000, height: 3000 },
	aspectRatio: 2,
};

describe("ImageCrop.sourceRect", () => {
	test.each([
		{
			why: "square frame over a landscape image takes the full height, centered",
			bounds: landscape,
			crop: ImageCrop.initial(),
			expected: { x: 1000, y: 0, width: 2000, height: 2000 },
		},
		{
			why: "wide frame over a portrait image takes the full width, centered",
			bounds: bannerOfPortrait,
			crop: ImageCrop.initial(),
			expected: { x: 0, y: 1250, width: 1000, height: 500 },
		},
		{
			why: "zoom shrinks the visible area around the center",
			bounds: landscape,
			crop: { ...ImageCrop.initial(), zoom: 2 },
			expected: { x: 1500, y: 500, width: 1000, height: 1000 },
		},
		{
			why: "rotation swaps the image sides",
			bounds: landscape,
			crop: { ...ImageCrop.initial(), rotation: 90 as const },
			expected: { x: 0, y: 1000, width: 2000, height: 2000 },
		},
	])("$why", ({ bounds, crop, expected }) => {
		expect(ImageCrop.sourceRect(crop, bounds)).toEqual(expected);
	});
});

describe("ImageCrop.clamp", () => {
	test.each([
		{ why: "below one", zoom: 0.2, expected: 1 },
		{ why: "above the max", zoom: 99, expected: ImageCrop.MAX_ZOOM },
	])("limits zoom $why", ({ zoom, expected }) => {
		expect(
			ImageCrop.clamp({ ...ImageCrop.initial(), zoom }, landscape).zoom,
		).toBe(expected);
	});

	test("keeps the frame inside the image", () => {
		const crop = ImageCrop.clamp(
			{ ...ImageCrop.initial(), center: { x: 0, y: 1 } },
			landscape,
		);

		expect(ImageCrop.sourceRect(crop, landscape)).toEqual({
			x: 0,
			y: 0,
			width: 2000,
			height: 2000,
		});
	});
});

describe("ImageCrop.pan", () => {
	test("dragging right reveals more of the image's left side", () => {
		const crop = ImageCrop.pan(
			ImageCrop.initial(),
			{ x: 100, y: 0 },
			200,
			landscape,
		);

		expect(ImageCrop.sourceRect(crop, landscape).x).toBe(0);
	});

	test("does nothing along an axis the image already fills", () => {
		const crop = ImageCrop.pan(
			ImageCrop.initial(),
			{ x: 0, y: 50 },
			200,
			landscape,
		);

		expect(crop).toEqual(ImageCrop.initial());
	});
});

describe("ImageCrop.zoomAround", () => {
	test("keeps the image point under the anchor in place", () => {
		const frameWidth = 200;
		const anchor = { x: 50, y: -30 };
		const before = ImageCrop.initial();
		const after = ImageCrop.zoomAround(
			before,
			2,
			anchor,
			frameWidth,
			landscape,
		);

		const pointUnderAnchor = (crop: ImageCrop.Crop) => {
			const rect = ImageCrop.sourceRect(crop, landscape);
			const imagePixelsPerScreenPixel = rect.width / frameWidth;
			return {
				x: rect.x + rect.width / 2 + anchor.x * imagePixelsPerScreenPixel,
				y: rect.y + rect.height / 2 + anchor.y * imagePixelsPerScreenPixel,
			};
		};

		expect(pointUnderAnchor(after)).toEqual(pointUnderAnchor(before));
	});
});

describe("ImageCrop.rotate", () => {
	test("goes back to the start after four turns", () => {
		const start = {
			...ImageCrop.initial(),
			zoom: 3,
			center: { x: 0.3, y: 0.4 },
		};

		let crop = start;
		for (let i = 0; i < 4; i++) {
			crop = ImageCrop.rotate(crop, landscape);
		}

		expect(crop.rotation).toBe(0);
		expect(crop.center.x).toBeCloseTo(start.center.x);
		expect(crop.center.y).toBeCloseTo(start.center.y);
	});

	test("keeps the same image point at the frame center", () => {
		const crop = ImageCrop.rotate(
			{ ...ImageCrop.initial(), zoom: 4, center: { x: 0.25, y: 0.5 } },
			landscape,
		);

		expect(crop.center).toEqual({ x: 0.5, y: 0.25 });
	});
});
