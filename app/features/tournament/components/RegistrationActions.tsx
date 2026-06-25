import { ClipboardCheck, ClipboardList, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import { useUser } from "~/features/auth/core/user";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentRegisterPage, tournamentSubsPage } from "~/utils/urls";

export function RegistrationActions({
	tournament,
}: {
	tournament: Tournament;
}) {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();

	if (tournament.hasStarted) return null;

	if (tournament.teamMemberOfByUser(user)) {
		return (
			<div className="stack horizontal sm justify-center items-center">
				<LinkButton
					to={tournamentRegisterPage(tournament.ctx.id)}
					size="big"
					variant="outlined"
					icon={<ClipboardList />}
				>
					{t("tournament:join.viewRegistration")}
				</LinkButton>
			</div>
		);
	}

	if (!tournament.registrationOpen) return null;

	return (
		<div className="stack horizontal sm justify-center items-center">
			<LinkButton
				to={tournamentRegisterPage(tournament.ctx.id)}
				size="big"
				icon={<ClipboardCheck />}
				testId="register-cta"
			>
				{t("tournament:registerNow")}
			</LinkButton>
			{tournament.lfgEnabled ? (
				<LinkButton
					to={tournamentSubsPage(tournament.ctx.id)}
					size="big"
					variant="outlined"
					icon={<UserPlus />}
				>
					{t("tournament:findTeam")}
				</LinkButton>
			) : null}
		</div>
	);
}
