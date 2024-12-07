import * as ScrimPostRepository from "../ScrimPostRepository.server";

export const loader = async () => {
	return {
		posts: await ScrimPostRepository.findAllRelevant(),
	};
};
