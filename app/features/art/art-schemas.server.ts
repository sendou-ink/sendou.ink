import * as v from "valibot";
import { _action, id } from "~/utils/schema";

const deleteArtSchema = v.object({
	_action: _action("DELETE_ART"),
	id,
});

const unlinkArtSchema = v.object({
	_action: _action("UNLINK_ART"),
	id,
});

export const userArtPageActionSchema = v.union([
	deleteArtSchema,
	unlinkArtSchema,
]);
