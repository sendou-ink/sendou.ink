import type { Tables } from "~/db/tables";
import { userArtSearchParams } from "~/features/user-page/user-page-search-params";
import { type UserLinkArgs, userPage } from "~/utils/urls";
import {
	artGridSearchParams,
	artNewSearchParams,
	artSearchParams,
} from "./art-search-params";
import type { ArtSource } from "./art-types";

export const artPage = (tag?: string) =>
	artSearchParams.href("/art", { tag: tag ?? null });

export const userArtPage = (
	user: UserLinkArgs,
	source?: ArtSource,
	bigArtId?: number,
) =>
	artGridSearchParams.href(
		userArtSearchParams.href(`${userPage(user)}/art`, {
			...(source ? { source } : {}),
		}),
		{ big: bigArtId ?? null },
	);

export const newArtPage = (artId?: Tables["Art"]["id"]) =>
	artNewSearchParams.href(`${artPage()}/new`, { art: artId ?? null });
