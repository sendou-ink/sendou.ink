import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { TierPill } from "~/components/TierPill";
import { tournamentPage } from "~/utils/urls";
import {
	GraphicContainer,
	GraphicDateSubtitle,
	GraphicFooter,
	GraphicHeader,
	GraphicPlacementCell,
	GraphicSiteUrl,
	type GraphicTeam,
	GraphicTeamRow,
	GraphicTeamsList,
	GraphicTitle,
} from "./Graphic";
import styles from "./TournamentResultsGraphic.module.css";

export interface TournamentResultsGraphicTeam extends GraphicTeam {
	placement: number;
}

export function TournamentResultsGraphic({
	tournamentId,
	tournamentName,
	startTime,
	logoUrl,
	tier,
	organization,
	teams,
	teamsCount,
	playersCount,
}: {
	tournamentId: number;
	tournamentName: string;
	startTime: Date;
	logoUrl?: string;
	tier?: number;
	organization?: { name: string; avatarUrl?: string };
	teams: TournamentResultsGraphicTeam[];
	teamsCount: number;
	playersCount: number;
}) {
	return (
		<GraphicContainer>
			<TournamentGraphicHeader
				tournamentName={tournamentName}
				startTime={startTime}
				logoUrl={logoUrl}
				tier={tier}
				organization={organization}
			/>
			<GraphicTeamsList>
				{teams.map((team) => (
					<GraphicTeamRow
						key={`${team.placement}-${team.name}`}
						team={team}
						highlighted={team.placement === 1}
						leading={<GraphicPlacementCell placement={team.placement} />}
					/>
				))}
			</GraphicTeamsList>
			<TournamentGraphicFooter
				teamsCount={teamsCount}
				playersCount={playersCount}
				path={tournamentPage(tournamentId)}
			/>
		</GraphicContainer>
	);
}

export function TournamentGraphicHeader({
	tournamentName,
	startTime,
	logoUrl,
	tier,
	organization,
}: {
	tournamentName: string;
	startTime: Date;
	logoUrl?: string;
	tier?: number;
	organization?: { name: string; avatarUrl?: string };
}) {
	return (
		<GraphicHeader
			avatarUrl={logoUrl}
			identiconInput={tournamentName}
			titleRow={
				<GraphicTitle>
					{tournamentName}
					{typeof tier === "number" ? (
						<span className={styles.tierPillContainer}>
							<TierPill tier={tier} withoutAnimation />
						</span>
					) : null}
				</GraphicTitle>
			}
			subtitle={<GraphicDateSubtitle date={startTime} />}
			trailing={
				organization ? (
					<>
						<span className={styles.organizationName}>{organization.name}</span>
						<Avatar
							url={organization.avatarUrl}
							identiconInput={organization.name}
							size="xs"
							alt=""
						/>
					</>
				) : null
			}
		/>
	);
}

export function TournamentGraphicFooter({
	teamsCount,
	playersCount,
	path,
}: {
	teamsCount: number;
	playersCount: number;
	path: string;
}) {
	const { t } = useTranslation(["calendar"]);

	return (
		<GraphicFooter>
			<div>
				{t("calendar:count.teams", { count: teamsCount })} ·{" "}
				{t("calendar:count.players", { count: playersCount })}
			</div>
			<GraphicSiteUrl path={path} />
		</GraphicFooter>
	);
}
