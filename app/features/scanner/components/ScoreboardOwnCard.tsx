import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import { AbilityGrid } from "./AbilityGrid";
import {
	EventCardMeta,
	EventCardShell,
	EventCardTeam,
	EventCardTeams,
	EventCardWeaponIcon,
} from "./EventCardShell";
import { FrameThumb } from "./FrameThumb";
import { useEventTimeFormatter } from "./format";
import { lobbyLabel, mainWeaponLabel, modeLabel, stageLabel } from "./labels";
import { MetaPills } from "./MetaChips";

export function ScoreboardOwnCard(props: {
	t: number;
	confidence: number;
	data: ScoreboardOwnData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const formatDetectedAt = useEventTimeFormatter();
	return (
		<EventCardShell>
			<EventCardMeta>
				<MetaPills
					t={t}
					confidence={confidence}
					type={SCOREBOARD_OWN_EVENT_TYPE}
					label="own results"
				/>
				<span>
					{[
						lobbyLabel(data.lobby),
						modeLabel(data.mode),
						stageLabel(data.stage),
					]
						.map((v) => v ?? "?")
						.join(" · ")}
				</span>
				<span>
					weapon <b>{mainWeaponLabel(data.weaponId) ?? "?"}</b>
				</span>
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "ScoreboardOwn" }}
				/>
			</EventCardMeta>
			<EventCardTeams layout="solo">
				<EventCardTeam>
					{data.weaponId !== null ? (
						<EventCardWeaponIcon weaponSplId={data.weaponId} />
					) : null}
					<AbilityGrid abilities={data.abilities} />
				</EventCardTeam>
			</EventCardTeams>
		</EventCardShell>
	);
}
