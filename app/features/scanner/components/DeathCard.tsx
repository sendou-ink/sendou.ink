import { Ability } from "~/components/Ability";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import styles from "./DeathCard.module.css";
import {
	EventCardMeta,
	EventCardShell,
	EventCardTeam,
	EventCardTeams,
	EventCardWeaponIcon,
} from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { useEventTimeFormatter } from "./format";
import { weaponLabel } from "./labels";
import { MetaPills } from "./MetaChips";

export function DeathCard(props: {
	t: number;
	confidence: number;
	data: DeathData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const weaponName = weaponLabel(data.weaponType, data.weaponId);
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={DEATH_EVENT_TYPE}
					label="death"
				/>
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "Death" }}
				/>
			</EventCardMeta>
			<EventCardTeams layout="death">
				<EventCardTeam>
					<div className={styles.body}>
						{data.weaponId !== null && data.weaponType === "MAIN" ? (
							<EventCardWeaponIcon
								weaponSplId={data.weaponId as MainWeaponId}
							/>
						) : null}
						<div className={styles.info}>
							<span className={styles.name}>
								splatted by <b>{data.name ?? "?"}</b>
							</span>
							<span className={styles.weapon}>{weaponName ?? "?"}</span>
						</div>
						<div className={styles.abilities}>
							{data.abilities.map((row, i) => (
								<div key={i} className={styles.gear}>
									{row.map((id, j) => (
										<Ability
											key={j}
											ability={id}
											size={j === 0 ? "SUBTINY" : "TINY"}
										/>
									))}
								</div>
							))}
						</div>
					</div>
				</EventCardTeam>
			</EventCardTeams>
		</EventCardShell>
	);
}
