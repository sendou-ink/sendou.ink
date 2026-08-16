import { redirect } from "react-router";
import { MATCH_PROFILE_PAGE } from "~/utils/urls";

export const loader = () => {
	throw redirect(MATCH_PROFILE_PAGE);
};

export default function MatchProfileRedirect() {
	return null;
}
