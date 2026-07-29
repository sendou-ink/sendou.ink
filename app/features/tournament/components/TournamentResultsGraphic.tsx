import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { TierPill } from "~/components/TierPill";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { ordinalSuffix } from "~/utils/i18n";
import { tournamentPage } from "~/utils/urls";
import styles from "./TournamentResultsGraphic.module.css";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "long",
	year: "numeric",
};

export interface TournamentResultsGraphicTeam {
	placement: number;
	name: string;
	logoUrl?: string;
	players: Array<{ name: string; countryCode?: string }>;
	weapons: MainWeaponId[];
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
		<div className={styles.container}>
			<header className={styles.header}>
				<Avatar
					url={logoUrl}
					identiconInput={tournamentName}
					size="sm"
					alt=""
				/>
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
			<ol className={styles.teamsList}>
				{teams.map((team) => (
					<TeamRow key={`${team.placement}-${team.name}`} team={team} />
				))}
			</ol>
			<footer className={styles.footer}>
				<div>
					{t("calendar:count.teams", { count: teamsCount })} ·{" "}
					{t("calendar:count.players", { count: playersCount })}
				</div>
				<div>
					sendou<span className={styles.footerAccent}>.ink</span>
					{tournamentPage(tournamentId)}
				</div>
			</footer>
		</div>
	);
}

function TeamRow({ team }: { team: TournamentResultsGraphicTeam }) {
	return (
		<li
			className={clsx(styles.teamRow, {
				[styles.teamRowFirst]: team.placement === 1,
			})}
		>
			<PlacementCell placement={team.placement} />
			<Avatar url={team.logoUrl} identiconInput={team.name} size="sm" alt="" />
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
					<WeaponImage
						key={`${weaponSplId}-${index}`}
						weaponSplId={weaponSplId}
						variant="badge"
						size={38}
					/>
				))}
			</div>
		</li>
	);
}

function PlacementCell({ placement }: { placement: number }) {
	const { i18n } = useTranslation();

	const suffix = ordinalSuffix(placement, i18n.language).replace(/^\^/, "");

	return (
		<div className={clsx(styles.placement, placementAccentClass(placement))}>
			{placement}
			<span className={styles.placementSuffix}>{suffix}</span>
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
