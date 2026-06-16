import { requireRole } from "~/modules/permissions/guards.server";
import * as ExternalStreamRepository from "../ExternalStreamRepository.server";

export const loader = async () => {
	requireRole("ADMIN");

	return {
		streams: await ExternalStreamRepository.all(),
	};
};
