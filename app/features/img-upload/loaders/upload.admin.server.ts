import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { countAllUnvalidatedImg } from "../queries/countAllUnvalidatedImg.server";
import { unvalidatedImages } from "../queries/unvalidatedImages";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	requireRole(user, "STAFF");

	return {
		images: unvalidatedImages(),
		unvalidatedImgCount: countAllUnvalidatedImg(),
	};
};
