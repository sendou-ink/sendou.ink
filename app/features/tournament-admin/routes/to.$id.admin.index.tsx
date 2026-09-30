import { Outlet, useOutletContext } from "react-router";

/** Shared by the teams table (index) and the registration editor as sibling routes, so the editor replaces the table instead of a modal. */
export default function TournamentAdminTeamsLayout() {
	const outletContext = useOutletContext();

	return <Outlet context={outletContext} />;
}
