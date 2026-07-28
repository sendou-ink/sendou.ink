import { z } from "zod";
import { _action, id } from "~/utils/zod";

const deleteArtSchema = z.object({
	_action: _action("DELETE_ART"),
	id,
});

const unlinkArtSchema = z.object({
	_action: _action("UNLINK_ART"),
	id,
});

export const userArtPageActionSchema = z.union([
	deleteArtSchema,
	unlinkArtSchema,
]);
