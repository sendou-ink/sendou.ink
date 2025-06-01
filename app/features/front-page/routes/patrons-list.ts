import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { Unwrapped } from "../../../utils/types";

export type PatronsListLoaderData = {
	patrons: Array<Unwrapped<typeof UserRepository.findAllPatrons>>;
};

export const loader = async () => {
	return Response.json(
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
