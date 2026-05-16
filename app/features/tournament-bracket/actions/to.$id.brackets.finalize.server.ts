import { errorToast } from "~/utils/remix.server";

export const action = async () => {
	errorToast("Finalizing tournament temporarily disabled");
};
