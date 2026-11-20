import * as Articles from "../core/Articles.server";

const MAX_ARTICLES_COUNT = 100;

export const loader = async () => {
	return {
		articles: await Articles.mostRecent(MAX_ARTICLES_COUNT),
	};
};
