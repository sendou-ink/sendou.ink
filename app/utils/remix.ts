import type {
	ShouldRevalidateFunctionArgs,
	useLoaderData,
} from "@remix-run/react";
import { makeTitle } from "./strings";
import { COMMON_PREVIEW_IMAGE } from "./urls";

export function isRevalidation(args: ShouldRevalidateFunctionArgs) {
	return (
		args.defaultShouldRevalidate && args.nextUrl.href === args.currentUrl.href
	);
}

// https://remix.run/docs/en/main/start/future-flags#serializefrom
export type SerializeFrom<T> = ReturnType<typeof useLoaderData<T>>;

interface OpenGraphArgs {
	title: string;
	ogTitle?: string;
	description?: string;
	/** e.g. /builds/splattershot */
	url: string;
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
		{ title: args.title === "sendou.ink" ? args.title : makeTitle(args.title) },
		{
			property: "og:title",
			content: args.ogTitle ?? args.title,
		},
		{
			name: "twitter:title",
			content: args.title,
		},
	];
}

// xxx: docs including "Twitter special snowflake tags, see https://developer.x.com/en/docs/twitter-for-websites/cards/overview/summary"
// xxx: better name since it is not just opengraph
// xxx: go through all meta description and add "on sendou.ink" ? <-- document these in OpenGraphArgs how to write good title & description
export function openGraph(args: OpenGraphArgs) {
	const result = [
		...metaTitle(args),
		args.description
			? {
					name: "description",
					content: args.description,
				}
			: null,
		args.description
			? {
					name: "twitter:description",
					content: args.description,
				}
			: null,
		{
			property: "og:description",
			content: args.description,
		},
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
			content: `${ROOT_URL}${args.url}`,
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
		{
			name: "twitter:card",
			content: "summary",
		},
		{
			name: "twitter:site",
			content: "@sendouink",
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
