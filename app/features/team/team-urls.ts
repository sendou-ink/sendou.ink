import { teamPage } from "~/utils/urls";
import { teamJoinSearchParams } from "./team-search-params";

export const joinTeamPage = ({
	customUrl,
	inviteCode,
}: {
	customUrl: string;
	inviteCode: string;
}) =>
	teamJoinSearchParams.href(`${teamPage(customUrl)}/join`, {
		code: inviteCode,
	});
