import type { SerializeFrom } from "@remix-run/node";
import * as BadgeRepository from "../BadgeRepository.server";

export type BadgesLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	return { badges: await BadgeRepository.all() };
};
