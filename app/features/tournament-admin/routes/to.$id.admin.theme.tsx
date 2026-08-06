import { CustomThemeSelector } from "~/components/CustomThemeSelector";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import styles from "~/form/SendouForm.module.css";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import type { ThemeInput } from "~/utils/oklch-gamut";
import { tournamentAdminPage } from "~/utils/urls";
import { adminThemeActionSchema } from "../tournament-admin-schemas";

export { action } from "../actions/to.$id.admin.theme.server";

export default function TournamentAdminThemePage() {
	const user = useUser();
	const tournament = useTournament();
	const { submit, state } = useActionSubmit(adminThemeActionSchema, {
		encType: "application/json",
	});

	if (
		!tournament.isAdmin(user) ||
		!tournament.ctx.organization?.isEstablished
	) {
		return <Redirect to={tournamentAdminPage(tournament.ctx.id)} />;
	}

	const handleSave = (themeInput: ThemeInput) => {
		submit("UPDATE_CUSTOM_THEME", { newValue: themeInput });
	};

	const handleReset = () => {
		submit("UPDATE_CUSTOM_THEME", { newValue: null });
	};

	return (
		<div className={styles.form}>
			<CustomThemeSelector
				initialTheme={tournament.ctx.customTheme}
				isSupporter
				isPersonalTheme={false}
				hidePatreonInfo
				onSave={handleSave}
				onReset={handleReset}
				fetcherState={state}
			/>
		</div>
	);
}
