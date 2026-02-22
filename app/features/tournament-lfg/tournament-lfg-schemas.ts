import { z } from "zod";
import { stringConstant, toggle } from "~/form/fields";

export const joinQueueFormSchema = z.object({
	_action: stringConstant("JOIN_QUEUE"),
	stayAsSub: toggle({
		label: "labels.stayAsSub",
		bottomText: "bottomTexts.stayAsSub",
	}),
});
