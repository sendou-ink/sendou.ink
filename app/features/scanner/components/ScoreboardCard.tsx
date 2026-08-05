import { WeaponImage } from "~/components/Image";
import type { PlayerAbilityMap } from "../core/ability-harvest";
import type {
	ScoreboardData,
	ScoreboardPlayer,
} from "../core/detectors/scoreboard/index";
import { SCOREBOARD_REPLAY_EVENT_TYPE } from "../core/detectors/scoreboard-replay/index";
import { AbilityPopover } from "./AbilityGrid";
import { EventTypeIcon } from "./EventTypeIcon";
import { FrameThumb } from "./FrameThumb";
import type { CardData } from "./fixture-export";
import { formatTime } from "./format";
import { lobbyLabel, modeLabel, stageLabel } from "./labels";

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
		<table className="players">
			<tbody>
				{players.map((p, i) => (
					<tr key={i}>
						<td>
							<span className="weapon-cell">
								{p.weaponId !== null ? (
									<WeaponImage
										weaponSplId={p.weaponId}
										variant="build"
										size={28}
										className="weapon-icon"
									/>
								) : null}
								{abilities?.has(offset + i) ? (
									<AbilityPopover abilities={abilities.get(offset + i)!} />
								) : null}
							</span>
						</td>
						<td>{p.name || "?"}</td>
						<td className="num">{p.paint ?? "?"}p</td>
						<td className="num">
							{p.ka ?? "?"}/{p.d ?? "?"}/{p.s ?? "?"}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function teamHeading(label: string, data: CardData, side: 0 | 1): string {
	const score = `${label} — ${data.scores[side] ?? "?"}p`;
	const match = data.matchScores?.[side];
	return match != null ? `${score} · score ${match}` : score;
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
	const isReplay = eventType === SCOREBOARD_REPLAY_EVENT_TYPE;
	return (
		<div className="card">
			<div className="meta">
				<span>t={formatTime(t)}</span>
				<span className="status detected">
					<EventTypeIcon type={eventType} />
					{isReplay ? "replay" : "scoreboard"}
				</span>
				{(data.mode !== null || data.stage !== null) && (
					<span>
						{[
							lobbyLabel(data.lobby),
							modeLabel(data.mode),
							stageLabel(data.stage),
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				)}
				{data.timestamp && <span>{data.timestamp}</span>}
				{data.replayCode && <span className="score">{data.replayCode}</span>}
				<span>confidence {(confidence * 100).toFixed(0)}%</span>
				{detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: eventType }}
				/>
			</div>
			<div className="teams">
				<div className="team win">
					<h3>{teamHeading("Victory", data, 0)}</h3>
					<PlayerRows
						players={data.players.slice(0, 4)}
						offset={0}
						abilities={props.abilities}
					/>
				</div>
				<div className="team lose">
					<h3>{teamHeading("Defeat", data, 1)}</h3>
					<PlayerRows
						players={data.players.slice(4, 8)}
						offset={4}
						abilities={props.abilities}
					/>
				</div>
			</div>
		</div>
	);
}
