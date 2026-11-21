import clsx from "clsx";
import { MousePointerClick } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ModeShort } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../Avatar";
import { ModeImage } from "../Image";
import styles from "./MatchBannerBottomRow.module.css";

interface MatchBannerBottomRowProps {
	games: Array<{ mode: ModeShort | null }>;
	/** The game whose map the banner shows in place of the current one. */
	previewedGameIndex?: number | null;
	activeRosters: {
		alpha: CommonUser[] | null;
		bravo: CommonUser[] | null;
	} | null;
}

export function MatchBannerBottomRow({
	games,
	previewedGameIndex = null,
	activeRosters,
}: MatchBannerBottomRowProps) {
	return (
		<div className={styles.root}>
			<ModeProgress games={games} previewedGameIndex={previewedGameIndex} />
			<ActiveRosters activeRosters={activeRosters} />
		</div>
	);
}

function ModeProgress({
	games,
	previewedGameIndex,
}: Pick<MatchBannerBottomRowProps, "games" | "previewedGameIndex">) {
	const knownModes = games.flatMap((game) => (game.mode ? [game.mode] : []));
	// collapsed there's no single game to mark
	const allSameMode =
		previewedGameIndex === null &&
		knownModes.length === games.length &&
		games.length > 1 &&
		knownModes.every((mode) => mode === knownModes[0]);

	if (allSameMode) {
		return (
			<div className={styles.modeProgress}>
				<div
					className={styles.mode}
					data-testid={`mode-progress-${knownModes[0]}`}
				>
					<ModeImage mode={knownModes[0]} size={16} />
				</div>
				<div className={styles.modeCount}>×{games.length}</div>
			</div>
		);
	}

	return (
		<div className={styles.modeProgress}>
			{games.map((game, i) =>
				game.mode ? (
					<div
						key={i}
						className={clsx(styles.mode, {
							[styles.modePreviewed]: i === previewedGameIndex,
						})}
						data-testid={`mode-progress-${game.mode}`}
						data-previewed={i === previewedGameIndex || undefined}
					>
						<ModeImage mode={game.mode} size={16} />
					</div>
				) : (
					<div
						key={i}
						className={clsx(styles.mode, styles.modePlaceholder)}
						data-testid="mode-progress-banned"
					>
						<MousePointerClick size={16} />
					</div>
				),
			)}
		</div>
	);
}

function Roster({ users }: { users: CommonUser[] }) {
	return (
		<div className={styles.team}>
			{users.map((user) => (
				<Avatar key={user.id} user={user} size="xxs" />
			))}
		</div>
	);
}

function ActiveRosters({
	activeRosters,
}: Pick<MatchBannerBottomRowProps, "activeRosters">) {
	const { t } = useTranslation(["q"]);

	if (!activeRosters?.alpha || !activeRosters.bravo) {
		return null;
	}

	return (
		<div className={styles.activeRosters}>
			<Roster users={activeRosters.alpha} />
			<div className={styles.vs}>{t("q:match.banner.vs")}</div>
			<Roster users={activeRosters.bravo} />
		</div>
	);
}
