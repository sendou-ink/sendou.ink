import type { SerializeFrom } from "react-router";
import * as BadgeRepository from "../BadgeRepository.server";

export type BadgesLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	return { badges: await BadgeRepository.all() };
};
