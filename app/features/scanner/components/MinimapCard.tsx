import { ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
	type MinimapEnemy,
	type MinimapTeammate,
} from "../core/detectors/minimap/index";
import type { CardSlot } from "../core/detectors/minimap/rois";
import { FrameThumb } from "./FrameThumb";
import { useEventTimeFormatter } from "./format";
import { stageLabel } from "./labels";
import { MetaPills } from "./MetaChips";

const ENEMY_SLOT_LETTERS = ["A", "B", "X", "Y"] as const;

function AbilityRow({
	abilities,
}: {
	abilities: (AbilityWithUnknown | null)[];
}) {
	return (
		<>
			{abilities.map((id, i) =>
				id ? (
					<Ability key={i} ability={id} size="TINY" />
				) : (
					<span key={i} title="unreadable badge">
						?
					</span>
				),
			)}
		</>
	);
}

function TeammateMarker({ slot }: { slot: CardSlot }) {
	if (slot === "self") {
		return <span className="slot-marker">●</span>;
	}
	return (
		<span className={`slot-marker ${slot}`}>
			<ChevronUp strokeWidth={3.5} aria-label={slot} role="img" />
		</span>
	);
}

function PlayerRow({
	marker,
	player,
}: {
	marker: ReactNode;
	player: MinimapTeammate | MinimapEnemy;
}) {
	return (
		<div className="minimap-player">
			{marker}
			{player.weaponId !== null ? (
				<WeaponImage
					weaponSplId={player.weaponId}
					variant="build"
					size={24}
					className="weapon-icon"
				/>
			) : (
				<span className="weapon-missing">?</span>
			)}
			<span className="name">{player.name ?? ""}</span>
			<span className="abilities">
				<AbilityRow abilities={player.abilities} />
			</span>
		</div>
	);
}

export function MinimapCard(props: {
	t: number;
	confidence: number;
	data: MinimapData;
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
		<div className="card">
			<div className="meta">
				<MetaPills
					t={t}
					confidence={confidence}
					type={MINIMAP_EVENT_TYPE}
					label="minimap"
				/>
				{data.stage !== null ? <span>{stageLabel(data.stage)}</span> : null}
				{detectedAt ? <span>{formatDetectedAt(detectedAt)}</span> : null}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "Minimap" }}
				/>
			</div>
			<div className="teams">
				<div className="team">
					<h3>Team</h3>
					{data.teammates.map((p) => (
						<PlayerRow
							key={p.slot}
							marker={<TeammateMarker slot={p.slot} />}
							player={p}
						/>
					))}
				</div>
				{data.enemies.length > 0 ? (
					<div className="team">
						<h3>Enemies</h3>
						{data.enemies.map((p, i) => (
							<PlayerRow
								key={i}
								marker={
									<span className="slot-marker">
										{ENEMY_SLOT_LETTERS[i] ?? i + 1}
									</span>
								}
								player={p}
							/>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
