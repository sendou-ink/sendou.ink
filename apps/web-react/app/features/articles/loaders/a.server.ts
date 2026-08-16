import { mostRecentArticles } from "../core/list.server";

const MAX_ARTICLES_COUNT = 100;

export const loader = async () => {
	return {
		articles: await mostRecentArticles(MAX_ARTICLES_COUNT),
	};
};
