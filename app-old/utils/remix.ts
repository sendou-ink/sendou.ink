import type {
	Location,
	ShouldRevalidateFunctionArgs,
	useLoaderData,
} from "@remix-run/react";
import { truncateBySentence } from "./strings";
import { COMMON_PREVIEW_IMAGE } from "./urls";

export function isRevalidation(args: ShouldRevalidateFunctionArgs) {
	return (
		args.defaultShouldRevalidate && args.nextUrl.href === args.currentUrl.href
	);
}

// https://remix.run/docs/en/main/start/future-flags#serializefrom
export type SerializeFrom<T> = ReturnType<typeof useLoaderData<T>>;

interface OpenGraphArgs {
	/** Title as shown by the browser in the tab etc. Appended with "| sendou.ink"*/
	title: string;
	/** Title as shown when shared on Bluesky, Discord etc. Also used in search results. If omitted, "title" is used instead. */
	ogTitle?: string;
	/** Brief description of the page's contents used by search engines and social media sharing. If the description is over 300 characters long it is automatically truncated. */
	description?: string;
	location: Location;
	/** Optionally override location pathname. */
	url?: string;
	image?: {
		url: string;
		dimensions?: {
			width: number;
			height: number;
		};
	};
}

const ROOT_URL = "https://sendou.ink";

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
			content: `${ROOT_URL}${args.location.pathname}`,
		},
		{
			property: "og:image",
			content: (() => {
				if (args.image?.url.startsWith("http")) {
					return args.image.url;
				}

				if (args.image) {
					return `${ROOT_URL}${args.image.url}`;
				}

				return `${ROOT_URL}${COMMON_PREVIEW_IMAGE}`;
			})(),
		},
	].filter((val) => val !== null);

	if (!args.image) {
		result.push({
			property: "og:image:width",
			content: "1920",
		});

		result.push({
			property: "og:image:height",
			content: "1080",
		});
	} else if (args.image.dimensions) {
		result.push({
			property: "og:image:width",
			content: String(args.image.dimensions.width),
		});

		result.push({
			property: "og:image:height",
			content: String(args.image.dimensions.height),
		});
	}

	return result;
}
