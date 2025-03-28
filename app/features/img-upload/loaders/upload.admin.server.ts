import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { isMod } from "~/permissions";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { countAllUnvalidatedImg } from "../queries/countAllUnvalidatedImg.server";
import { oneUnvalidatedImage } from "../queries/oneUnvalidatedImage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

	notFoundIfFalsy(isMod(user));

	return {
		image: oneUnvalidatedImage(),
		unvalidatedImgCount: countAllUnvalidatedImg(),
	};
};
