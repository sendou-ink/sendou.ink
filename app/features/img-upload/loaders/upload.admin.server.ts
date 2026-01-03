import { requireUser } from "~/features/auth/core/user.server";
import { requireRole } from "~/modules/permissions/guards.server";
import * as ImageRepository from "../ImageRepository.server";

export const loader = async () => {
	const user = requireUser();
	requireRole(user, "STAFF");

	return {
		images: await ImageRepository.unvalidatedImages(),
		unvalidatedImgCount: await ImageRepository.countAllUnvalidated(),
	};
};
