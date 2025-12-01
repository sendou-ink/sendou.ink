import { z } from "zod";

export const oAuthTokensSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	expires_in: z.number(),
	refresh_token: z.string(),
	scope: z.string(),
});

export type RawDiscordTokens = z.infer<typeof oAuthTokensSchema>;

export const userDataSchema = z.object({
	user: z.object({
		id: z.string(),
	}),
});
