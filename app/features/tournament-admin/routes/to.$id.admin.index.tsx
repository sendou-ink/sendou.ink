import { Outlet, useOutletContext } from "react-router";

/**
 * Layout shared by the admin teams table (index) and the registration editor.
 * Rendering them as sibling routes lets the editor take over the content area
 * in place of the table instead of opening as a modal on top of it.
 */
export default function TournamentAdminTeamsLayout() {
	const outletContext = useOutletContext();

	return <Outlet context={outletContext} />;
}
