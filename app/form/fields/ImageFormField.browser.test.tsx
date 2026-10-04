import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ImageFieldDimensions, ImageFieldValue } from "../image-field";
import { ImageFormField } from "./ImageFormField";

const RED = "rgb(255, 0, 0)";
const GREEN = "rgb(0, 255, 0)";
const BLUE = "rgb(0, 0, 255)";

describe("ImageFormField", () => {
	test("crops a picked image to the field's exact dimensions", async () => {
		const result = await pickImage({
			dimensions: "thick-banner",
			stripes: [RED, GREEN, BLUE],
			stripeSize: { width: 300, height: 400 },
		});

		await page.getByRole("button", { name: "Apply" }).click();

		const output = await decodedOutput(result);
		expect(output.size).toEqual({ width: 1000, height: 500 });
	});

	test("centers the crop by default", async () => {
		const result = await pickImage({
			dimensions: "logo",
			stripes: [RED, GREEN, BLUE],
			stripeSize: { width: 100, height: 100 },
		});

		await page.getByRole("button", { name: "Apply" }).click();

		const output = await decodedOutput(result);
		expect(output.colorAt(0.5, 0.5)).toBe(GREEN);
	});

	test("arrow keys move the cropped area", async () => {
		const result = await pickImage({
			dimensions: "logo",
			stripes: [RED, GREEN, BLUE],
			stripeSize: { width: 100, height: 100 },
		});

		await userEvent.click(page.getByRole("application"));
		for (let i = 0; i < 40; i++) {
			await userEvent.keyboard("{ArrowLeft}");
		}
		await page.getByRole("button", { name: "Apply" }).click();

		const output = await decodedOutput(result);
		expect(output.colorAt(0.5, 0.5)).toBe(RED);
	});

	test("rotating turns the output clockwise", async () => {
		const result = await pickImage({
			dimensions: "logo",
			stripes: [RED, BLUE],
			stripeSize: { width: 100, height: 200 },
		});

		await page.getByRole("button", { name: "Rotate" }).click();
		await page.getByRole("button", { name: "Apply" }).click();

		const output = await decodedOutput(result);
		expect(output.colorAt(0.5, 0.1)).toBe(RED);
		expect(output.colorAt(0.5, 0.9)).toBe(BLUE);
	});

	test("dropping an image opens the editor", async () => {
		const result = await pickImage({
			dimensions: "logo",
			stripes: [RED, GREEN, BLUE],
			stripeSize: { width: 100, height: 100 },
			via: "drop",
		});

		await page.getByRole("button", { name: "Apply" }).click();

		const output = await decodedOutput(result);
		expect(output.colorAt(0.5, 0.5)).toBe(GREEN);
	});

	test("cancelling leaves the field empty", async () => {
		const result = await pickImage({
			dimensions: "logo",
			stripes: [RED],
			stripeSize: { width: 100, height: 100 },
		});

		await page.getByRole("button", { name: "Cancel" }).click();

		await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
		expect(result.value).toBeNull();
	});
});

async function pickImage({
	dimensions,
	stripes,
	stripeSize,
	via = "picker",
}: {
	dimensions: ImageFieldDimensions;
	stripes: string[];
	stripeSize: { width: number; height: number };
	via?: "picker" | "drop";
}) {
	const result: { value: ImageFieldValue } = { value: null };

	function Harness() {
		const [value, setValue] = React.useState<ImageFieldValue>(null);
		return (
			<ImageFormField
				name="image"
				label="Image"
				dimensions={dimensions}
				value={value}
				onChange={(newValue) => {
					result.value = newValue;
					setValue(newValue);
				}}
			/>
		);
	}

	const router = createMemoryRouter([{ path: "*", element: <Harness /> }]);
	await render(<RouterProvider router={router} />);

	const file = await stripedImageFile(stripes, stripeSize);
	if (via === "drop") {
		dropFile(page.getByText("Drop an image here").element(), file);
	} else {
		await userEvent.upload(page.getByLabelText("Image"), file);
	}
	await expect.element(page.getByRole("dialog")).toBeVisible();

	return result;
}

function dropFile(target: Element, file: File) {
	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(file);

	for (const type of ["dragenter", "dragover", "drop"]) {
		target.dispatchEvent(
			new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }),
		);
	}
}

async function stripedImageFile(
	colors: string[],
	stripeSize: { width: number; height: number },
) {
	const canvas = document.createElement("canvas");
	canvas.width = stripeSize.width * colors.length;
	canvas.height = stripeSize.height;
	const context = canvas.getContext("2d")!;

	for (const [i, color] of colors.entries()) {
		context.fillStyle = color;
		context.fillRect(
			i * stripeSize.width,
			0,
			stripeSize.width,
			stripeSize.height,
		);
	}

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/png"),
	);
	return new File([blob!], "stripes.png", { type: "image/png" });
}

async function decodedOutput(result: { value: ImageFieldValue }) {
	await expect.poll(() => result.value?.type).toBe("NEW");
	if (result.value?.type !== "NEW") throw new Error("no new image");

	const image = new Image();
	image.src = result.value.dataUrl;
	await image.decode();

	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d")!;
	context.drawImage(image, 0, 0);

	return {
		size: { width: image.naturalWidth, height: image.naturalHeight },
		colorAt: (x: number, y: number) => {
			const [r, g, b] = context.getImageData(
				Math.floor(x * image.naturalWidth),
				Math.floor(y * image.naturalHeight),
				1,
				1,
			).data;
			return nearestPrimary(r, g, b);
		},
	};
}

function nearestPrimary(r: number, g: number, b: number) {
	const max = Math.max(r, g, b);
	if (max === r) return RED;
	if (max === g) return GREEN;
	return BLUE;
}
