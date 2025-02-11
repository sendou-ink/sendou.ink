import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import Markdown from "markdown-to-jsx";
import * as React from "react";
import { Main } from "~/components/Main";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import {
	ARTICLES_MAIN_PAGE,
	articlePage,
	articlePreviewUrl,
	navIconUrl,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
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

	return metaTags({
		title: data.title,
		description,
		image: {
			url: articlePreviewUrl(args.params.slug),
		},
		location: args.location,
	});
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

	return data.authors.map((author, i) => {
		if (!author.link) return author.name;

		const authorLink = author.link.includes("https://sendou.ink")
			? author.link.replace("https://sendou.ink", "")
			: author.link;

		return (
			<React.Fragment key={author.name}>
				{author.link.includes("https://sendou.ink") ? (
					<Link to={authorLink}>{author.name}</Link>
				) : (
					<a href={author.link}>{author.name}</a>
				)}
				{i < data.authors.length - 1 ? " & " : ""}
			</React.Fragment>
		);
	});
}
