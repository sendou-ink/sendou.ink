import { requireRole } from "~/modules/permissions/guards.server";
import * as ImageRepository from "../ImageRepository.server";

export const loader = async () => {
	requireRole("STAFF");

	return {
		images: await ImageRepository.unvalidatedImages(),
		unvalidatedImgCount: await ImageRepository.countAllUnvalidated(),
	};
};
