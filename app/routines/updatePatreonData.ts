import { updatePatreonData } from "../modules/patreon";
import { Routine } from "./routine.server";

export const UpdatePatreonDataRoutine = new Routine({
	name: "UpdatePatreonData",
	func: async () => {
		await updatePatreonData();
	},
});
