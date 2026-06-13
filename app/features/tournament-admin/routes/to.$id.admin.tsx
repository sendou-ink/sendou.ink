import clsx from "clsx";
import {
	History,
	ListOrdered,
	SquarePen,
	Trophy,
	Tv,
	UserCog,
	Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useOutletContext } from "react-router";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { containerClassName } from "~/components/Main";
import { Redirect } from "~/components/Redirect";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import {
	calendarEventPage,
	tournamentAdminPage,
	tournamentEditPage,
	tournamentPage,
} from "~/utils/urls";
import styles from "./to.$id.admin.module.css";

export { action } from "../actions/to.$id.admin.index.server";

const HORIZONTAL_TABS_BELOW = 720;

type AdminTab = "teams" | "seeds" | "staff" | "stream" | "brackets" | "audit";

export default function TournamentAdminLayout() {
	const { t } = useTranslation(["tournament", "calendar"]);
	const tournament = useTournament();
	const outletContext = useOutletContext();
	const user = useUser();
	const location = useLocation();

	const showReopen = Boolean(
		DANGEROUS_CAN_ACCESS_DEV_CONTROLS &&
			tournament.ctx.isFinalized &&
			tournament.isAdmin(user),
	);
	const showEditBrackets =
		tournament.isAdmin(user) &&
		tournament.hasStarted &&
		!tournament.ctx.isFinalized;
	const showStaffTab = tournament.isAdmin(user);
	const showBracketsTab =
		!tournament.isLeagueSignup || showEditBrackets || showReopen;
	const showSeedsTab = !tournament.hasStarted && !tournament.isLeagueSignup;

	if (
		!tournament.isOrganizer(user) ||
		(tournament.ctx.isFinalized && !DANGEROUS_CAN_ACCESS_DEV_CONTROLS)
	) {
		return <Redirect to={tournamentPage(tournament.ctx.id)} />;
	}

	const adminPage = tournamentAdminPage(tournament.ctx.id);
	const subPath = location.pathname.slice(adminPage.length).replace(/^\//, "");
	const currentTab: AdminTab =
		subPath === "" || subPath.startsWith("registration")
			? "teams"
			: (subPath as AdminTab);

	return (
		<div className={clsx("stack lg", containerClassName("wide"))}>
			{tournament.isAdmin(user) && !tournament.hasStarted ? (
				<div className="stack horizontal items-end">
					<LinkButton
						to={tournamentEditPage(tournament.ctx.eventId)}
						size="small"
						variant="outlined"
						icon={<SquarePen />}
						testId="edit-event-info-button"
					>
						Edit event info
					</LinkButton>
					{!tournament.isLeagueSignup ? (
						<FormWithConfirm
							dialogHeading={t("calendar:actions.delete.confirm", {
								name: tournament.ctx.name,
							})}
							action={calendarEventPage(tournament.ctx.eventId)}
							submitButtonTestId="delete-submit-button"
						>
							<SendouButton
								className="ml-auto"
								size="small"
								variant="minimal-destructive"
								type="submit"
							>
								{t("calendar:actions.delete")}
							</SendouButton>
						</FormWithConfirm>
					) : null}
				</div>
			) : null}
			<SendouTabs
				orientation="vertical"
				horizontalBelow={HORIZONTAL_TABS_BELOW}
				selectedKey={currentTab}
			>
				<SendouTabList>
					<SendouTab id="teams" href={adminPage} icon={<Users />}>
						{t("tournament:admin.tab.teams")}
					</SendouTab>
					{showSeedsTab ? (
						<SendouTab
							id="seeds"
							href={`${adminPage}/seeds`}
							icon={<ListOrdered />}
						>
							{t("tournament:admin.tab.seeds")}
						</SendouTab>
					) : null}
					{showStaffTab ? (
						<SendouTab
							id="staff"
							href={`${adminPage}/staff`}
							icon={<UserCog />}
						>
							{t("tournament:admin.tab.staff")}
						</SendouTab>
					) : null}
					<SendouTab id="stream" href={`${adminPage}/stream`} icon={<Tv />}>
						{t("tournament:admin.tab.stream")}
					</SendouTab>
					{showBracketsTab ? (
						<SendouTab
							id="brackets"
							href={`${adminPage}/brackets`}
							icon={<Trophy />}
						>
							{t("tournament:admin.tab.brackets")}
						</SendouTab>
					) : null}
					<SendouTab id="audit" href={`${adminPage}/audit`} icon={<History />}>
						{t("tournament:admin.tab.audit")}
					</SendouTab>
				</SendouTabList>
				<SendouTabPanel id={currentTab} className={styles.panel}>
					<Outlet context={outletContext} />
				</SendouTabPanel>
			</SendouTabs>
		</div>
	);
}
