import type { PlayerAbilityMap } from "../core/ability-harvest";
import type {
	ScoreboardData,
	ScoreboardPlayer,
} from "../core/detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log-replay/index";
import { AbilityPopover } from "./AbilityGrid";
import {
	EventCardMeta,
	EventCardNumberCell,
	EventCardPlayerTable,
	EventCardShell,
	EventCardTeam,
	EventCardTeams,
	EventCardWeaponCell,
	EventCardWeaponIcon,
} from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import type { CardData } from "./fixture-export";
import { useEventTimeFormatter } from "./format";
import { lobbyLabel, modeLabel, stageLabel } from "./labels";
import { MetaPills } from "./MetaChips";

function PlayerRows({
	players,
	offset,
	abilities,
}: {
	players: ScoreboardPlayer[];
	/** index of the first row within the full 8-player list */
	offset: number;
	abilities?: PlayerAbilityMap;
}) {
	return (
		<EventCardPlayerTable>
			{players.map((p, i) => (
				<tr key={i}>
					<td>
						<EventCardWeaponCell>
							{p.weaponId !== null ? (
								<EventCardWeaponIcon weaponSplId={p.weaponId} />
							) : null}
							{abilities?.has(offset + i) ? (
								<AbilityPopover abilities={abilities.get(offset + i)!} />
							) : null}
						</EventCardWeaponCell>
					</td>
					<td>{p.name || "?"}</td>
					<EventCardNumberCell>{p.paint ?? "?"}p</EventCardNumberCell>
					<EventCardNumberCell>
						{p.ka ?? "?"}/{p.d ?? "?"}/{p.s ?? "?"}
					</EventCardNumberCell>
				</tr>
			))}
		</EventCardPlayerTable>
	);
}

function teamHeading(label: string, data: CardData, side: 0 | 1): string {
	const score = data.matchScores[side];
	return score !== null ? `${label} — ${score}` : label;
}

export function ScoreboardCard(props: {
	t: number;
	confidence: number;
	data: ScoreboardData;
	/** DetectedEvent type; replay cards add timestamp/code details */
	eventType?: string;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	/** when set, shows an Inspect button (open this match in the screenshot page) */
	onInspect?: () => void;
	/** abilities harvested from this match's death events, by player index */
	abilities?: PlayerAbilityMap;
}) {
	const { t, confidence, thumbnail, detectedAt, getFrame, onInspect } = props;
	const eventType = props.eventType ?? "Scoreboard";
	const data = props.data as CardData;
	const isReplay = eventType === SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE;
	const isScoreboardBattleLog = eventType === SCOREBOARD_BATTLE_LOG_EVENT_TYPE;
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={eventType}
					label={
						isReplay
							? "replay scoreboard"
							: isScoreboardBattleLog
								? "battle log"
								: "scoreboard"
					}
				/>
				{data.mode !== null || data.stage !== null ? (
					<span>
						{[
							lobbyLabel(data.lobby),
							modeLabel(data.mode),
							stageLabel(data.stage),
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				) : null}
				{data.timestamp ? <span>{data.timestamp}</span> : null}
				{data.replayCode ? (
					<span className="text-xxs text-lighter">{data.replayCode}</span>
				) : null}
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: eventType }}
				/>
			</EventCardMeta>
			<EventCardTeams>
				<EventCardTeam result="win">
					<h3>{teamHeading("Victory", data, 0)}</h3>
					<PlayerRows
						players={data.players.slice(0, 4)}
						offset={0}
						abilities={props.abilities}
					/>
				</EventCardTeam>
				<EventCardTeam result="lose">
					<h3>{teamHeading("Defeat", data, 1)}</h3>
					<PlayerRows
						players={data.players.slice(4, 8)}
						offset={4}
						abilities={props.abilities}
					/>
				</EventCardTeam>
			</EventCardTeams>
		</EventCardShell>
	);
}
