import { redirect } from "react-router";
import { SENDOUQ_SETTINGS_PAGE } from "~/utils/urls";

export const loader = () => {
	throw redirect(SENDOUQ_SETTINGS_PAGE);
};

export default function QSettingsRedirect() {
	return null;
}
