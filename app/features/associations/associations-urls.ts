import { associationsSearchParams } from "./associations-search-params";

export const associationsPage = (inviteCode?: string) =>
	associationsSearchParams.href("/associations", {
		inviteCode: inviteCode ?? null,
	});
