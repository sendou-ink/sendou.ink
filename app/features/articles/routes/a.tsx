import type { MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { ARTICLES_MAIN_PAGE, articlePage, navIconUrl } from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
import { mostRecentArticles } from "../core/list.server";

import "~/styles/front.css";
import { joinListToNaturalString } from "../../../utils/arrays";

const MAX_ARTICLES_COUNT = 100;

export const handle: SendouRouteHandle = {
	breadcrumb: () => ({
		imgPath: navIconUrl("articles"),
		href: ARTICLES_MAIN_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Articles",
		ogTitle: "Splatoon articles",
		description:
			"Articles about the competitive side of Splatoon. Written by various community members.",
		location: args.location,
	});
};

export const loader = async () => {
	return {
		articles: await mostRecentArticles(MAX_ARTICLES_COUNT),
	};
};

export default function ArticlesMainPage() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<ul className="articles-list">
				{data.articles.map((article) => (
					<li key={article.title}>
						<Link
							to={articlePage(article.slug)}
							className="articles-list__title"
						>
							{article.title}
						</Link>
						<div className="text-xs text-lighter">
							{t("common:articles.by", {
								author: joinListToNaturalString(
									article.authors.map((a) => a.name),
									"&",
								),
							})}{" "}
							• <time>{article.dateString}</time>
						</div>
					</li>
				))}
			</ul>
		</Main>
	);
}
