import * as BadgeRepository from "../BadgeRepository.server";

export const loader = async () => {
	return { badges: await BadgeRepository.findAll() };
};
