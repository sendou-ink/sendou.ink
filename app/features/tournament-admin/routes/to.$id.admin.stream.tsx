import { useTournament } from "~/features/tournament/routes/to.$id";
import { SendouForm } from "~/form/SendouForm";
import { adminStreamFormSchema } from "../tournament-admin-staff-schemas";

export { action } from "../actions/to.$id.admin.stream.server";

export default function TournamentAdminStreamPage() {
	const tournament = useTournament();

	return (
		<SendouForm
			schema={adminStreamFormSchema}
			fullWidth
			submitButtonTestId="save-cast-twitch-accounts-button"
			defaultValues={{
				castTwitchAccounts: tournament.ctx.castTwitchAccounts ?? [],
			}}
		>
			{({ FormField }) => <FormField name="castTwitchAccounts" />}
		</SendouForm>
	);
}
