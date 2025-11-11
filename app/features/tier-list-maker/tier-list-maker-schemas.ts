import { z } from "zod/v4";

export const tierListItemTypeSchema = z.enum([
	"main-weapon",
	"sub-weapon",
	"special-weapon",
	"stage",
]);
