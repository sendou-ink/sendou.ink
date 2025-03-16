import type { SerializeFrom } from "@remix-run/node";
import { json } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export type PatronsListLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	return json(
		{
			patrons: await UserRepository.findAllPatrons(),
		},
		{
			headers: {
				// 4 hours
				"Cache-Control": "public, max-age=14400",
			},
		},
	);
};
