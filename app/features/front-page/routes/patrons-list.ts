import * as UserRepository from "~/features/user-page/UserRepository.server";

export type PatronsListLoaderData = {
	patrons: Awaited<ReturnType<typeof UserRepository.findAllPatrons>>;
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
