import type { Location } from "react-router";
import { describe, expect, test } from "vitest";
import { metaTags } from "./remix";
import { DEFAULT_OG_IMAGE } from "./urls";

const location = { pathname: "/to/1/brackets" } as Location;

const contentOf = (tags: ReturnType<typeof metaTags>, property: string) =>
	tags.find((tag) => "property" in tag && tag.property === property)?.content;

const twitterCardOf = (tags: ReturnType<typeof metaTags>) =>
	tags.find((tag) => "name" in tag && tag.name === "twitter:card")?.content;

const imageUrl = "https://cdn.example.com/img/preview.png";

describe("metaTags()", () => {
	test("uses the default OG image when no image given", () => {
		const tags = metaTags({ title: "sendou.ink", location });

		expect(contentOf(tags, "og:image")).toBe(DEFAULT_OG_IMAGE);
		expect(contentOf(tags, "og:image:width")).toBe("1200");
		expect(contentOf(tags, "og:image:height")).toBe("630");
	});

	test("uses the given image url", () => {
		const tags = metaTags({
			title: "sendou.ink",
			location,
			image: { url: imageUrl },
		});

		expect(contentOf(tags, "og:image")).toBe(imageUrl);
	});

	test("resolves og:url from the location pathname", () => {
		const tags = metaTags({ title: "sendou.ink", location });

		expect(contentOf(tags, "og:url")).toBe("https://sendou.ink/to/1/brackets");
	});

	test("prefers the url override over the location pathname", () => {
		const tags = metaTags({ title: "sendou.ink", location, url: "/to/1" });

		expect(contentOf(tags, "og:url")).toBe("https://sendou.ink/to/1");
	});

	test.each([
		{ why: "the default image", image: undefined, card: "summary_large_image" },
		{
			why: "an image of unknown size",
			image: { url: imageUrl },
			card: "summary_large_image",
		},
		{
			why: "a wide image",
			image: { url: imageUrl, dimensions: { width: 1200, height: 630 } },
			card: "summary_large_image",
		},
		{
			why: "a small image",
			image: { url: imageUrl, dimensions: { width: 124, height: 124 } },
			card: "summary",
		},
	])("asks for the $card card with $why", ({ image, card }) => {
		const tags = metaTags({ title: "sendou.ink", location, image });

		expect(twitterCardOf(tags)).toBe(card);
	});
});
