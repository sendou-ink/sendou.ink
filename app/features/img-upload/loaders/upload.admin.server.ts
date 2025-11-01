import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { requireRole } from "~/modules/permissions/guards.server";
import * as ImageRepository from "../ImageRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	requireRole(user, "STAFF");

	return {
		images: await ImageRepository.unvalidatedImages(),
		unvalidatedImgCount: await ImageRepository.countAllUnvalidated(),
	};
};
