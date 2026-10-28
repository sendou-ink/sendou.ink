import { describe, expect, test } from "vitest";
import { imageExtensionFromMagicBytes } from "./image-signature";

const header = (...parts: Array<string | number[]>) =>
	Uint8Array.from(
		parts.flatMap((part) =>
			typeof part === "string"
				? [...part].map((char) => char.charCodeAt(0))
				: part,
		),
	);

describe("imageExtensionFromMagicBytes", () => {
	test.each([
		{
			why: "png",
			bytes: header([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a, 0]),
			expected: "png",
		},
		{
			why: "jpeg",
			bytes: header([0xff, 0xd8, 0xff, 0xe0]),
			expected: "jpeg",
		},
		{
			why: "webp",
			bytes: header("RIFF", [0, 0, 0, 0], "WEBPVP8 "),
			expected: "webp",
		},
		{ why: "gif", bytes: header("GIF89a", [0, 2, 0, 2]), expected: null },
		{
			why: "avif",
			bytes: header([0, 0, 0, 0x1c], "ftypavif", [0, 0, 0, 0]),
			expected: null,
		},
		{ why: "truncated png", bytes: header([0x89], "PNG"), expected: null },
	])("$why", ({ bytes, expected }) => {
		expect(imageExtensionFromMagicBytes(bytes)).toBe(expected);
	});
});
