import * as React from "react";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { LocaleTime } from "~/components/LocaleTime";
import { Main } from "~/components/Main";
import { Markdown } from "~/components/Markdown";
import { invariant } from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	ARTICLES_MAIN_PAGE,
	articlePreviewUrl,
	navIconUrl,
} from "~/utils/urls";
import { metaTags, type SerializeFrom } from "../../../utils/remix";
import * as Article from "../core/Article";

import { loader } from "../loaders/a.$slug.server";

export { loader };

export const handle: SendouRouteHandle = {
	breadcrumb: ({ match }) => {
		const data = match.loaderData as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("articles"),
				href: ARTICLES_MAIN_PAGE,
				type: "IMAGE",
			},
		];
	},
};

export const meta: MetaFunction = (args) => {
	invariant(args.params.slug);
	const data = args.loaderData as SerializeFrom<typeof loader> | null;

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

export default function ArticlePage() {
	const data = useLoaderData<typeof loader>();
	return (
		<Main>
			<article className="article">
				<h1>{data.title}</h1>
				<div className="text-sm text-lighter" data-testid="article-byline">
					by <Author /> •{" "}
					<LocaleTime
						date={new Date(data.date)}
						options={{
							day: "numeric",
							month: "numeric",
							year: "numeric",
							// article dates are calendar dates parsed as UTC midnight;
							// formatting in the viewer's zone would shift the day west of UTC
							timeZone: "UTC",
						}}
					/>
				</div>
				<Markdown>
					{Article.bodyWithoutLeadingTitle(data.content, data.title)}
				</Markdown>
			</article>
		</Main>
	);
}

function Author() {
	const data = useLoaderData<typeof loader>();

	return data.authors.map((author, i) => {
		const link = Article.authorHref(author);

		return (
			<React.Fragment key={author.name}>
				{!link ? (
					author.name
				) : link.isInternal ? (
					<Link to={link.href}>{author.name}</Link>
				) : (
					<a href={link.href}>{author.name}</a>
				)}
				{i < data.authors.length - 1 ? " & " : ""}
			</React.Fragment>
		);
	});
}
