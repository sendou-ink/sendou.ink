import type { LoaderFunctionArgs } from "react-router";
import { findByInviteCode } from "../queries/findTeamByInviteCode.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
	const url = new URL(request.url);
	const inviteCode = url.searchParams.get("code");

	return {
		teamId: inviteCode ? findByInviteCode(inviteCode)?.id : null,
		inviteCode,
	};
};
