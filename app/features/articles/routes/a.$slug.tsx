import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import Markdown from "markdown-to-jsx";
import * as React from "react";
import { Main } from "~/components/Main";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import {
	ARTICLES_MAIN_PAGE,
	articlePage,
	articlePreviewUrl,
	navIconUrl,
} from "~/utils/urls";
import { articleBySlug } from "../core/bySlug.server";

export const handle: SendouRouteHandle = {
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("articles"),
				href: ARTICLES_MAIN_PAGE,
				type: "IMAGE",
			},
			{
				text: data.title,
				href: articlePage(data.slug),
				type: "TEXT",
			},
		];
	},
};

export const meta: MetaFunction = (args) => {
	invariant(args.params.slug);
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	const description = data.content.trim().split("\n")[0];

	return [
		{ title: makeTitle(data.title) },
		{ property: "og:title", content: data.title },
		{ name: "description", content: description },
		{ property: "og:description", content: description },
		{ name: "twitter:card", content: "summary_large_image" },
		{ property: "og:image", content: articlePreviewUrl(args.params.slug) },
		{ property: "og:type", content: "article" },
		{ property: "og:site_name", content: "sendou.ink" },
	];
};

export const loader = ({ params }: LoaderFunctionArgs) => {
	invariant(params.slug);

	const article = notFoundIfFalsy(articleBySlug(params.slug));

	return { ...article, slug: params.slug };
};

export default function ArticlePage() {
	const data = useLoaderData<typeof loader>();
	return (
		<Main>
			<article className="article">
				<h1>{data.title}</h1>
				<div className="text-sm text-lighter">
					by <Author /> • <time>{data.dateString}</time>
				</div>
				<Markdown options={{ wrapper: React.Fragment }}>
					{data.content}
				</Markdown>
			</article>
		</Main>
	);
}

function Author() {
	const data = useLoaderData<typeof loader>();

	if (data.authorLink) {
		return <a href={data.authorLink}>{data.author}</a>;
	}

	return <>{data.author}</>;
}
