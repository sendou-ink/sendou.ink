import * as v from "valibot";

export const oAuthTokensSchema = v.object({
	access_token: v.string(),
	token_type: v.string(),
	expires_in: v.number(),
	refresh_token: v.string(),
	scope: v.string(),
});

export type RawDiscordTokens = v.InferOutput<typeof oAuthTokensSchema>;

export const userDataSchema = v.object({
	user: v.object({
		id: v.string(),
	}),
});
