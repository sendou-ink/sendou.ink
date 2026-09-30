import type {
	Location,
	ShouldRevalidateFunctionArgs,
	useLoaderData,
} from "react-router";
import { truncateBySentence } from "./strings";
import { DEFAULT_OG_IMAGE, type OgImagePage, ogImageUrl } from "./urls";

export function isRevalidation(args: ShouldRevalidateFunctionArgs) {
	return (
		args.defaultShouldRevalidate &&
		args.nextUrl.href === args.currentUrl.href &&
		!args.formMethod
	);
}

// https://remix.run/docs/en/main/start/future-flags#serializefrom
export type SerializeFrom<T> = ReturnType<typeof useLoaderData<T>>;

interface OpenGraphArgs {
	/** Browser tab title, appended with "| sendou.ink" */
	title: string;
	/** Title for link previews and search results, defaults to `title` */
	ogTitle?: string;
	/** Truncated past 300 characters */
	description?: string;
	location: Location;
	/** overrides location pathname */
	url?: string;
	image?: OpenGraphImage;
}

interface OpenGraphImage {
	/** absolute */
	url: string;
	dimensions?: {
		width: number;
		height: number;
	};
}

const ROOT_URL = "https://sendou.ink";

const OG_IMAGE_DIMENSIONS = { width: 1200, height: 630 };

/** Wide enough that link previews show the image as a big card rather than a thumbnail. */
const LARGE_IMAGE_MIN_WIDTH = 600;

/** OG image of one of the site's own pages, see the `/admin/og-images` page. */
export function ogPageImage(page: OgImagePage): OpenGraphImage {
	return { url: ogImageUrl(page), dimensions: OG_IMAGE_DIMENSIONS };
}

export function metaTitle(args: Pick<OpenGraphArgs, "title" | "ogTitle">) {
	return [
		{
			title:
				args.title === "sendou.ink" ? args.title : `${args.title} | sendou.ink`,
		},
		{
			property: "og:title",
			content: args.ogTitle ?? args.title,
		},
	];
}

export function metaTags(args: OpenGraphArgs) {
	const image = args.image ?? {
		url: DEFAULT_OG_IMAGE,
		dimensions: OG_IMAGE_DIMENSIONS,
	};

	const truncatedDescription = args.description
		? truncateBySentence(args.description, 300)
		: null;

	const result = [
		...metaTitle(args),
		args.description
			? {
					name: "description",
					content: truncatedDescription,
				}
			: null,
		args.description
			? {
					property: "og:description",
					content: truncatedDescription,
				}
			: null,
		{
			property: "og:site_name",
			content: "sendou.ink",
		},
		{
			property: "og:type",
			content: "website",
		},
		{
			property: "og:url",
			content: `${ROOT_URL}${args.url ?? args.location.pathname}`,
		},
		{
			property: "og:image",
			content: image.url,
		},
		{
			name: "twitter:card",
			content: isLargeImage(image) ? "summary_large_image" : "summary",
		},
	].filter((val) => val !== null);

	if (image.dimensions) {
		result.push({
			property: "og:image:width",
			content: String(image.dimensions.width),
		});

		result.push({
			property: "og:image:height",
			content: String(image.dimensions.height),
		});
	}

	return result;
}

function isLargeImage(image: OpenGraphImage) {
	if (!image.dimensions) return true;

	return image.dimensions.width >= LARGE_IMAGE_MIN_WIDTH;
}
