import { useFetcher } from "react-router";
import { CustomThemeSelector } from "~/components/CustomThemeSelector";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import styles from "~/form/SendouForm.module.css";
import type { ThemeInput } from "~/utils/oklch-gamut";
import { tournamentAdminPage } from "~/utils/urls";

export { action } from "../actions/to.$id.admin.theme.server";

export default function TournamentAdminThemePage() {
	const user = useUser();
	const tournament = useTournament();
	const fetcher = useFetcher();

	if (
		!tournament.isAdmin(user) ||
		!tournament.ctx.organization?.isEstablished
	) {
		return <Redirect to={tournamentAdminPage(tournament.ctx.id)} />;
	}

	const handleSave = (themeInput: ThemeInput) => {
		fetcher.submit(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: themeInput,
			} as unknown as Parameters<typeof fetcher.submit>[0],
			{ method: "post", encType: "application/json" },
		);
	};

	const handleReset = () => {
		fetcher.submit(
			{ _action: "UPDATE_CUSTOM_THEME", newValue: null },
			{ method: "post", encType: "application/json" },
		);
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
				fetcherState={fetcher.state}
			/>
		</div>
	);
}
