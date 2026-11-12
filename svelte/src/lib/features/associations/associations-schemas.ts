import * as v from "valibot";
import { inviteCode } from "~/utils/schema";

// typed inputs (unlike the coercing `id` of ~/utils/schema): a remote form derives its fields from the schema's input type
const id = v.pipe(v.number(), v.integer(), v.minValue(1));

export const associationIdSchema = v.object({ associationId: id });

export const associationMemberSchema = v.object({
	associationId: id,
	userId: id,
});

export const inviteCodeSchema = v.object({ inviteCode });
