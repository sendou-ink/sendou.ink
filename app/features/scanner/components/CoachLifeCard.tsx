/**
 * The summary of the POV player's life the video is at, over its first
 * seconds: how long it lasted, who they splatted, the specials they used and
 * how the objective moved. Tied to the video's time, so stepping life to life
 * while paused flips through the cards.
 */
import { Crosshair, Flag, Zap } from "lucide-react";
import type { ReactNode } from "react";
import {
	OutlinedImage,
	SpecialWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { abilityImageUrl } from "~/utils/urls";
import * as CoachEvents from "../core/CoachEvents";
import { WEAPON_KITS } from "../core/detectors/scoreboard/kits";
import { formatClock } from "../core/format";
import type { ScannerMatch } from "../core/scanner-match";
import styles from "./CoachLifeCard.module.css";
import { victimSlot } from "./game-timeline-view";

const SHOWN_S = 5;
/** kept mounted past the fade, as the video's time updates only a few times a second */
const MOUNTED_S = SHOWN_S + 1;
const ICON_SIZE = 24;

export function CoachLifeCard({
	lives,
	match,
	currentTime,
}: {
	lives: readonly CoachEvents.CoachLife[];
	match: ScannerMatch;
	currentTime: number;
}) {
	const index = lives.findLastIndex(
		(candidate) => candidate.start <= currentTime,
	);
	const life = lives[index];
	if (!life?.summary) return null;
	const elapsed = currentTime - life.start;
	if (elapsed >= MOUNTED_S) return null;

	const { summary } = life;
	const povTeam = CoachEvents.povTeamOf(match) ?? 0;
	const enemies = match.teams[povTeam === 0 ? 1 : 0].players;
	const povWeaponId = match.pov
		? (match.teams[povTeam].players[match.pov.index]?.weaponId ?? null)
		: null;
	const specialWeaponId =
		povWeaponId === null
			? null
			: (WEAPON_KITS.get(String(povWeaponId))?.special ?? null);

	return (
		<div
			key={life.start}
			className={styles.card}
			data-fading={elapsed >= SHOWN_S}
			aria-hidden
		>
			<div className={styles.header}>
				<span className={styles.life}>
					Life {index + 1}/{lives.length}
				</span>
				<span className={styles.duration}>{formatClock(summary.duration)}</span>
			</div>
			{summary.kills ? (
				<Row icon={<Crosshair />}>
					{summary.kills.length === 0
						? "—"
						: summary.kills.map((kill, killIndex) => {
								const slot = victimSlot(kill.name, enemies);
								const weaponId =
									slot === null ? null : (enemies[slot]?.weaponId ?? null);
								return weaponId === null ? (
									<UnknownIcon key={killIndex} />
								) : (
									<WeaponImage
										key={killIndex}
										weaponSplId={weaponId}
										variant="badge"
										size={ICON_SIZE}
									/>
								);
							})}
				</Row>
			) : null}
			{summary.specialsUsed !== null ? (
				<Row icon={<Zap />}>
					{summary.specialsUsed === 0
						? "—"
						: Array.from({ length: summary.specialsUsed }, (_, useIndex) =>
								specialWeaponId === null ? (
									<UnknownIcon key={useIndex} />
								) : (
									<SpecialWeaponImage
										key={useIndex}
										specialWeaponId={specialWeaponId}
										size={ICON_SIZE}
									/>
								),
							)}
				</Row>
			) : null}
			{summary.control ? (
				<Row
					icon={
						<Flag
							className={styles.controlFlag}
							data-outcome={controlOutcome(summary.control)}
						/>
					}
				>
					{controlText(summary.control)}
				</Row>
			) : null}
		</div>
	);
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
	return (
		<div className={styles.row}>
			<span className={styles.rowIcon}>{icon}</span>
			<span className={styles.rowContent}>{children}</span>
		</div>
	);
}

function UnknownIcon() {
	return (
		<OutlinedImage path={abilityImageUrl("UNKNOWN")} alt="" size={ICON_SIZE} />
	);
}

function controlOutcome(
	control: CoachEvents.CoachLifeControl,
): "better" | "worse" | "even" {
	if (control.ours > control.theirs) return "better";
	if (control.ours < control.theirs) return "worse";
	return "even";
}

function controlText(control: CoachEvents.CoachLifeControl): string {
	if (control.unit === "SECONDS") {
		return `Zone ${control.ours}s ours · ${control.theirs}s theirs`;
	}
	return `Pushed +${control.ours} · Lost −${control.theirs}`;
}
