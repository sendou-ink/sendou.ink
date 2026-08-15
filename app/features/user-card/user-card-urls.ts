import { userCardEditSearchParams } from "./user-card-search-params";

const USER_CARD_EDIT_PAGE = "/user-card/edit";

export const userCardEditPage = (args?: { returnTo?: string }) =>
	userCardEditSearchParams.href(USER_CARD_EDIT_PAGE, {
		returnTo: args?.returnTo ?? null,
	});
