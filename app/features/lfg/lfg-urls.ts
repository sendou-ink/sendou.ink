import { LFG_PAGE } from "~/utils/urls";
import { lfgNewSearchParams } from "./lfg-search-params";

export const lfgNewPostPage = (postId?: number) =>
	lfgNewSearchParams.href(`${LFG_PAGE}/new`, { postId: postId ?? null });
