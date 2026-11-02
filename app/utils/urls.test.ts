import { describe, expect, test } from "vitest";
import { smallImageUrl, USER_SUBMITTED_IMAGE_ROOT } from "./urls";

const root = USER_SUBMITTED_IMAGE_ROOT;

describe("smallImageUrl", () => {
	test.each([
		{
			why: "user submitted logo",
			url: `${root}/img-1-abc.webp`,
			expected: `${root}/img-1-abc-small.webp`,
		},
		{
			why: "already a small copy",
			url: `${root}/avatar-1-hash-small.webp`,
			expected: `${root}/avatar-1-hash-small.webp`,
		},
		{
			why: "file name without an extension",
			url: `${root}/Squid Slayer Logo Final`,
			expected: `${root}/Squid Slayer Logo Final`,
		},
		{
			why: "static asset",
			url: "/static-assets/img/layout/medal.avif",
			expected: "/static-assets/img/layout/medal.avif",
		},
		{
			why: "external URL",
			url: "https://cdn.discordapp.com/icons/1/abc.png",
			expected: "https://cdn.discordapp.com/icons/1/abc.png",
		},
	])("$why", ({ url, expected }) => {
		expect(smallImageUrl(url)).toBe(expected);
	});
});
