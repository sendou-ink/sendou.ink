import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { SpecialWeaponImage, WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { TierPill } from "~/components/TierPill";
import { weaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { ordinalSuffix } from "~/utils/i18n";
import { tournamentPage } from "~/utils/urls";
import styles from "./TournamentResultsGraphic.module.css";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "long",
	year: "numeric",
};

export interface GraphicTeam {
	name: string;
	logoUrl?: string;
	seed?: number;
	players: Array<{ name: string; countryCode?: string }>;
	weapons: MainWeaponId[];
}

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
	const { t } = useTranslation(["calendar"]);

	return (
		<GraphicContainer>
			<GraphicHeader
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
			<GraphicFooter>
				<div>
					{t("calendar:count.teams", { count: teamsCount })} ·{" "}
					{t("calendar:count.players", { count: playersCount })}
				</div>
				<GraphicSiteUrl path={tournamentPage(tournamentId)} />
			</GraphicFooter>
		</GraphicContainer>
	);
}

export function GraphicContainer({ children }: { children: React.ReactNode }) {
	return <div className={styles.container}>{children}</div>;
}

export function GraphicHeader({
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
		<header className={styles.header}>
			<Avatar url={logoUrl} identiconInput={tournamentName} size="sm" alt="" />
			<div>
				<div className={styles.tournamentNameRow}>
					<div className={styles.tournamentName}>{tournamentName}</div>
					{typeof tier === "number" ? <TierPill tier={tier} /> : null}
				</div>
				<LocaleTime
					date={startTime}
					options={DATE_FORMAT_OPTIONS}
					className={styles.tournamentDate}
				/>
			</div>
			{organization ? (
				<div className={styles.organization}>
					<span className={styles.organizationName}>{organization.name}</span>
					<Avatar
						url={organization.avatarUrl}
						identiconInput={organization.name}
						size="xs"
						alt=""
					/>
				</div>
			) : null}
		</header>
	);
}

export function GraphicTeamsList({ children }: { children: React.ReactNode }) {
	return <ol className={styles.teamsList}>{children}</ol>;
}

export function GraphicTeamRow({
	team,
	leading,
	highlighted = false,
	className,
	as: Element = "li",
}: {
	team: GraphicTeam;
	leading?: React.ReactNode;
	highlighted?: boolean;
	className?: string;
	as?: "li" | "div";
}) {
	return (
		<Element
			className={clsx(styles.teamRow, className, {
				[styles.teamRowFirst]: highlighted,
			})}
		>
			{leading}
			<div className={styles.avatarCell}>
				<Avatar
					url={team.logoUrl}
					identiconInput={team.name}
					size="sm"
					alt=""
				/>
				{typeof team.seed === "number" ? (
					<div className={styles.teamSeed}>#{team.seed}</div>
				) : null}
			</div>
			<div className={styles.teamInfo}>
				<div className={styles.teamName}>{team.name}</div>
				<div className={styles.playersList}>
					{team.players.map((player) => (
						<div key={player.name} className={styles.player}>
							{player.countryCode ? (
								<Flag countryCode={player.countryCode} tiny />
							) : null}
							<span className={styles.playerName}>{player.name}</span>
						</div>
					))}
				</div>
			</div>
			<div className={styles.weapons}>
				{team.weapons.map((weaponSplId, index) => (
					<div key={`${weaponSplId}-${index}`} className={styles.weaponKit}>
						<WeaponImage weaponSplId={weaponSplId} variant="badge" size={38} />
						<SpecialWeaponImage
							specialWeaponId={
								weaponParams().weaponKits[weaponSplId].specialWeaponId
							}
							size={24}
						/>
					</div>
				))}
			</div>
		</Element>
	);
}

export function GraphicPlacementCell({ placement }: { placement: number }) {
	const { i18n } = useTranslation();

	const suffix = ordinalSuffix(placement, i18n.language).replace(/^\^/, "");

	return (
		<div className={clsx(styles.placement, placementAccentClass(placement))}>
			{placement}
			<span className={styles.placementSuffix}>{suffix}</span>
		</div>
	);
}

export function GraphicFooter({ children }: { children: React.ReactNode }) {
	return <footer className={styles.footer}>{children}</footer>;
}

export function GraphicSiteUrl({ path }: { path: string }) {
	return (
		<div>
			sendou<span className={styles.footerAccent}>.ink</span>
			{path}
		</div>
	);
}

function placementAccentClass(placement: number) {
	switch (placement) {
		case 1:
			return styles.placementFirst;
		case 2:
			return styles.placementSecond;
		case 3:
			return styles.placementThird;
		default:
			return undefined;
	}
}
