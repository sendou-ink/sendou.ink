import type { Location } from "react-router";
import { describe, expect, test } from "vitest";
import { metaTags } from "./remix";
import { COMMON_PREVIEW_IMAGE } from "./urls";

const location = { pathname: "/to/1/brackets" } as Location;

const contentOf = (tags: ReturnType<typeof metaTags>, property: string) =>
	tags.find((tag) => "property" in tag && tag.property === property)?.content;

describe("metaTags()", () => {
	test("uses the common preview image when no image given", () => {
		const tags = metaTags({ title: "sendou.ink", location });

		expect(contentOf(tags, "og:image")).toBe(COMMON_PREVIEW_IMAGE);
	});

	test("uses the given image url", () => {
		const tags = metaTags({
			title: "sendou.ink",
			location,
			image: { url: "https://cdn.example.com/img/preview.png" },
		});

		expect(contentOf(tags, "og:image")).toBe(
			"https://cdn.example.com/img/preview.png",
		);
	});

	test("resolves og:url from the location pathname", () => {
		const tags = metaTags({ title: "sendou.ink", location });

		expect(contentOf(tags, "og:url")).toBe("https://sendou.ink/to/1/brackets");
	});

	test("prefers the url override over the location pathname", () => {
		const tags = metaTags({ title: "sendou.ink", location, url: "/to/1" });

		expect(contentOf(tags, "og:url")).toBe("https://sendou.ink/to/1");
	});
});
