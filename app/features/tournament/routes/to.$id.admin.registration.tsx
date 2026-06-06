import { useParams } from "react-router";
import { RegistrationFormDialog } from "../components/RegistrationForm";
import { useTournament } from "./to.$id";

export { action } from "../actions/to.$id.admin.registration.server";

// xxx: inline RegistrationFormDialog
// xxx: rename the route to include the .tid
export default function TournamentAdminRegistrationPage() {
	const tournament = useTournament();
	const { tid } = useParams();

	const team =
		typeof tid === "string" ? tournament.teamById(Number(tid)) : undefined;

	return <RegistrationFormDialog team={team} />;
}
