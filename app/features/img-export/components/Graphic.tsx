import clsx from "clsx";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { SpecialWeaponImage, WeaponImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { weaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import styles from "./Graphic.module.css";

export const GRAPHIC_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "long",
	year: "numeric",
};

/**
 * Sizes that keep the code at roughly two pixels per module. The lengths are the byte
 * capacities of the QR versions used at the default "L" error correction level.
 */
const QR_CODE_SIZE_BREAKPOINTS = [
	{ maxUrlLength: 106, size: 56 },
	{ maxUrlLength: 271, size: 84 },
	{ maxUrlLength: 523, size: 116 },
] as const;

const QR_CODE_SIZE_MAX = 144;

/** Full URL the graphic's QR code should link to, provided by `ImageExportDialog` (null = no QR code) */
export const GraphicQrCodeContext = React.createContext<string | null>(null);

export interface GraphicPlayer {
	name: string;
	countryCode?: string;
}

export interface GraphicTeam {
	name: string;
	logoUrl?: string;
	seed?: number;
	players: GraphicPlayer[];
	weapons: MainWeaponId[];
}

export function GraphicContainer({
	children,
	width,
}: {
	children: React.ReactNode;
	width?: number;
}) {
	const qrCodeUrl = React.useContext(GraphicQrCodeContext);

	return (
		<div className={styles.container} style={width ? { width } : undefined}>
			{children}
			{qrCodeUrl ? (
				<div className={styles.qrCodeRow}>
					<div className={styles.qrCode}>
						<QRCodeSVG value={qrCodeUrl} size={qrCodeSize(qrCodeUrl)} />
					</div>
				</div>
			) : null}
		</div>
	);
}

export function GraphicHeader({
	avatarUrl,
	identiconInput,
	titleRow,
	subtitle,
	trailing,
	alignTrailingWithTitle = false,
}: {
	avatarUrl?: string;
	identiconInput: string;
	titleRow: React.ReactNode;
	subtitle: React.ReactNode;
	trailing?: React.ReactNode;
	/** Line the trailing content up with the title instead of centering it against the title and subtitle together */
	alignTrailingWithTitle?: boolean;
}) {
	const trailingContent = trailing ? (
		<div className={styles.headerTrailing}>{trailing}</div>
	) : null;

	return (
		<header className={styles.header}>
			<Avatar
				url={avatarUrl}
				identiconInput={identiconInput}
				size="sm"
				alt=""
			/>
			<div className={styles.headerText}>
				<div className={styles.headerTitleRow}>
					{titleRow}
					{alignTrailingWithTitle ? trailingContent : null}
				</div>
				{subtitle}
			</div>
			{alignTrailingWithTitle ? null : trailingContent}
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
						<GraphicPlayerChip key={player.name} player={player} />
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

/**
 * A chip is sized by its content, and the image export freezes each element's width. Inline
 * elements are exempt from that, so the chip must stay a `span` or its name gets clipped.
 */
export function GraphicPlayerChip({ player }: { player: GraphicPlayer }) {
	return (
		<span className={styles.player}>
			{player.countryCode ? (
				<Flag countryCode={player.countryCode} tiny />
			) : null}
			<span className={styles.playerName}>{player.name}</span>
		</span>
	);
}

export function GraphicPlacementCell({ placement }: { placement: number }) {
	return (
		<div className={clsx(styles.placement, placementAccentClass(placement))}>
			<Placement placement={placement} textOnly />
		</div>
	);
}

export function GraphicStatsRow({ children }: { children: React.ReactNode }) {
	return <div className={styles.statsRow}>{children}</div>;
}

export function GraphicStat({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.stat}>
			<div className={styles.boxLabel}>{label}</div>
			<div className={styles.statValue}>{children}</div>
		</div>
	);
}

export function GraphicWonLost({ won, lost }: { won: number; lost: number }) {
	return (
		<>
			<span className={styles.statWin}>{won}</span>
			<span className={styles.statSeparator}>-</span>
			<span className={styles.statLoss}>{lost}</span>
		</>
	);
}

export function GraphicScore({
	ownScore,
	opponentScore,
}: {
	ownScore: number;
	opponentScore: number;
}) {
	return (
		<div
			className={clsx(
				styles.score,
				ownScore > opponentScore ? styles.scoreWin : styles.scoreLoss,
			)}
		>
			{ownScore}-{opponentScore}
		</div>
	);
}

export function GraphicSectionDivider({
	children,
	as: Element = "div",
}: {
	children: React.ReactNode;
	as?: "div" | "li";
}) {
	return <Element className={styles.sectionDivider}>{children}</Element>;
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

function qrCodeSize(url: string) {
	for (const breakpoint of QR_CODE_SIZE_BREAKPOINTS) {
		if (url.length <= breakpoint.maxUrlLength) {
			return breakpoint.size;
		}
	}
	return QR_CODE_SIZE_MAX;
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
