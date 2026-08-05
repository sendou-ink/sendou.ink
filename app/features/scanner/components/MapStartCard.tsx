import type { MapStartData } from "../core/detectors/map-start/index";
import { saveFixtureFromEvent } from "./fixture-export";
import { formatTime } from "./format";
import { modeLabel, stageLabel } from "./labels";

export function MapStartCard(props: {
	t: number;
	confidence: number;
	data: MapStartData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	return (
		<div className="card">
			<div className="meta">
				<span>t={formatTime(t)}</span>
				<span className="status detected">map start</span>
				<span>
					<b>{modeLabel(data.mode) ?? "?"}</b> · {stageLabel(data.stage) ?? "?"}
				</span>
				<span>confidence {(confidence * 100).toFixed(0)}%</span>
				{detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
				{onInspect && (
					<button type="button" onClick={onInspect}>
						Inspect
					</button>
				)}
				{getFrame && (
					<button
						type="button"
						onClick={() =>
							void getFrame().then(
								(f) => f && saveFixtureFromEvent(f, data, "MapStart"),
							)
						}
					>
						Save fixture
					</button>
				)}
				{thumbnail && (
					<img className="thumb" src={thumbnail} alt="analyzed frame" />
				)}
			</div>
		</div>
	);
}
