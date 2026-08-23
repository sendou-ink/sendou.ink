import clsx from "clsx";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { useSearchParam } from "~/modules/search-params/hooks";
import { mainWeaponImageUrl } from "~/utils/urls";
import { CANONICAL_HEIGHT, CANONICAL_WIDTH, type Roi } from "../core/canonical";
import type { DeathData } from "../core/detectors/death/index";
import * as death from "../core/detectors/death/rois";
import type { MapStartData } from "../core/detectors/map-start/index";
import * as mapStart from "../core/detectors/map-start/rois";
import type { MinimapData } from "../core/detectors/minimap/index";
import * as minimap from "../core/detectors/minimap/rois";
import type { ObjectiveData } from "../core/detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
	type PlayerStatusLayout,
} from "../core/detectors/objective/player-status";
import * as objective from "../core/detectors/objective/rois";
import type { ScoreboardRowDebug } from "../core/detectors/scoreboard/index";
import * as sb from "../core/detectors/scoreboard/rois";
import * as bl from "../core/detectors/scoreboard-battle-log/rois";
import * as replay from "../core/detectors/scoreboard-battle-log-replay/rois";
import type { ScoreboardOwnData } from "../core/detectors/scoreboard-own/index";
import * as own from "../core/detectors/scoreboard-own/rois";
import type { DetectedEvent } from "../core/detectors/types";
import { scannerSearchParams } from "../scanner-search-params";
import { claimInspectFrame } from "../store/inspect";
import { AnalyzerClient } from "../worker/client";
import type { WorkerResponse } from "../worker/protocol";
import { downloadEventsCsv } from "./events-csv";
import { type CardData, downloadExpectedJson } from "./fixture-export";
import {
	lobbyLabel,
	mainWeaponLabel,
	modeLabel,
	stageLabel,
	weaponLabel,
} from "./labels";
import { ScannerDropzone } from "./ScannerChrome";
import styles from "./ScreenshotPage.module.css";

type Result = Extract<WorkerResponse, { kind: "result" }>;

/** Draw a ROI crop from the normalized frame, scaled up. */
export function RoiCrop(props: {
	frame: HTMLCanvasElement;
	roi: Roi;
	scale?: number;
}) {
	const { frame, roi, scale = 1.5 } = props;
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current!;
		canvas.width = Math.round(roi.w * scale);
		canvas.height = Math.round(roi.h * scale);
		const ctx = canvas.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(
			frame,
			roi.x,
			roi.y,
			roi.w,
			roi.h,
			0,
			0,
			canvas.width,
			canvas.height,
		);
	}, [frame, roi.x, roi.y, roi.w, roi.h, scale]);
	return <canvas ref={ref} />;
}

function Stat(props: { label: string; raw?: unknown; children: ReactNode }) {
	return (
		<span className={styles.stat}>
			<span className={styles.statLabel}>{props.label}</span>
			<span className={styles.statValue}>{props.children}</span>
			{props.raw != null && props.raw !== "" ? (
				<span className={styles.statRaw}>raw: {String(props.raw)}</span>
			) : null}
		</span>
	);
}

function LabeledCrop(props: {
	label: string;
	frame: HTMLCanvasElement;
	roi: Roi;
	scale?: number;
}) {
	return (
		<figure>
			<RoiCrop frame={props.frame} roi={props.roi} scale={props.scale} />
			<figcaption>{props.label}</figcaption>
		</figure>
	);
}

/** One pill per player slot: number = alive, ★ = special held, ✗ = splatted. */
function StatusSlots(props: { data: PlayerStatusData }) {
	return (
		<span className={styles.statusSlots}>
			{([0, 1] as const).map((side) => (
				<span key={side} className={styles.statusSide}>
					{props.data.dead[side].map((dead, slot) => {
						const special = !dead && props.data.special[side][slot];
						return (
							<span
								key={slot}
								className={clsx(styles.statusSlot, {
									[styles.dead]: dead,
									[styles.special]: special,
								})}
							>
								{dead ? "✗" : special ? "★" : slot + 1}
							</span>
						);
					})}
				</span>
			))}
		</span>
	);
}

/** Per-row parse ROIs, in the same order as the event's players array. */
interface RowRois {
	weapon: Roi;
	name: Roi;
	paint: Roi;
	stats: [Roi, Roi, Roi];
}

function scoreboardRows(): RowRois[] {
	return sb.ROW_CENTERS.map((cy) => ({
		weapon: sb.weaponRoi(cy),
		name: sb.nameRoi(cy),
		paint: sb.paintRoi(cy),
		stats: [sb.statRoi(cy, 0), sb.statRoi(cy, 1), sb.statRoi(cy, 2)],
	}));
}

/** winnerSide comes from the event debug: players are ordered winners-first. */
function battleLogRows(winnerSide: string): RowRois[] {
	const panels = winnerSide === "bottom" ? [bl.PANEL_DY, 0] : [0, bl.PANEL_DY];
	return panels.flatMap((dy) =>
		bl.ROW_CENTERS.map((base) => {
			const cy = base + dy;
			return {
				weapon: bl.weaponRoi(cy),
				name: bl.nameRoi(cy),
				paint: bl.paintRoi(cy),
				stats: [bl.statRoi(cy, 0), bl.statRoi(cy, 1), bl.statRoi(cy, 2)] as [
					Roi,
					Roi,
					Roi,
				],
			};
		}),
	);
}

/** winnerSide comes from the event debug: players are ordered winners-first. */
function replayRows(winnerSide: string): RowRois[] {
	const panels =
		winnerSide === "right" ? [replay.PANEL_DX, 0] : [0, replay.PANEL_DX];
	return panels.flatMap((dx) =>
		replay.ROW_CENTERS.map((cy) => ({
			weapon: replay.weaponRoi(cy, dx),
			name: replay.nameRoi(cy, dx),
			paint: replay.paintRoi(cy, dx),
			stats: [
				replay.statRoi(cy, dx, 0),
				replay.statRoi(cy, dx, 1),
				replay.statRoi(cy, dx, 2),
			] as [Roi, Roi, Roi],
		})),
	);
}

/** Same marker language as the objective status pills: ✗ dead, ★ special. */
function playerFlags(p: { dead: boolean; specialReady: boolean }) {
	return `${p.dead ? " ✗" : ""}${p.specialReady ? " ★" : ""}`;
}

export function formatTimer(time: number | null) {
	if (time === null) return "?:??";
	return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
}

/** One-line recap of what a fired detector read, for the gate list. */
function gateSummary(result: Result): string | null {
	const event = result.events[0];
	if (!event) return null;
	const confidence = `${((event.confidence ?? 0) * 100).toFixed(1)}% conf`;
	switch (result.detector) {
		case "death": {
			const data = event.data as DeathData;
			return `${confidence} · splatted by ${weaponLabel(data.weaponType, data.weaponId) ?? "?"} (${data.name ?? "?"})`;
		}
		case "map-start": {
			const data = event.data as MapStartData;
			return `${confidence} · ${modeLabel(data.mode) ?? "?"} · ${stageLabel(data.stage) ?? "?"}`;
		}
		case "scoreboard-own": {
			const data = event.data as ScoreboardOwnData;
			return `${confidence} · ${[lobbyLabel(data.lobby), modeLabel(data.mode), stageLabel(data.stage)].map((v) => v ?? "?").join(" · ")} · ${mainWeaponLabel(data.weaponId) ?? "?"}`;
		}
		case "minimap": {
			const data = event.data as MinimapData;
			const players = data.teammates
				.map((p) => `${p.name ?? "?"}${playerFlags(p)}`)
				.join(", ");
			return `${confidence} · ${data.stage ?? "?"} · ${players}`;
		}
		case "objective": {
			const data = event.data as unknown as ObjectiveData;
			return `${confidence} · ${formatTimer(data.time)} · score ${data.score[0] ?? "?"}–${data.score[1] ?? "?"}`;
		}
		default: {
			const data = event.data as CardData;
			return `${confidence} · scores ${JSON.stringify(data.matchScores)} · ${[lobbyLabel(data.lobby), modeLabel(data.mode), stageLabel(data.stage)].map((v) => v ?? "?").join(" · ")}`;
		}
	}
}

/** Band covering one side's player-status icon strip, for the crop view. */
function statusStripRoi(layout: PlayerStatusLayout, side: 0 | 1): Roi {
	const centers =
		layout === "even"
			? objective.STATUS_SLOT_CENTERS_EVEN[side]
			: layout === "narrow-right"
				? objective.STATUS_SLOT_CENTERS_NARROW_RIGHT[side]
				: objective.STATUS_SLOT_CENTERS_NARROW_LEFT[side];
	const first = centers[0]!;
	const last = centers[centers.length - 1]!;
	return { x: first - 55, y: 25, w: last - first + 110, h: 115 };
}

function drawOverlay(ctx: CanvasRenderingContext2D, detector: string) {
	const rect = (roi: Roi, color: string) => {
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.strokeRect(roi.x, roi.y, roi.w, roi.h);
	};
	if (detector === "death") {
		rect(death.SPLAT_LINE1_ROI, "#34d399");
		rect(death.WEAPON_LINE_ROI, "#f87171");
		for (let row = 0; row < death.ABILITY_ROWS; row++) {
			rect(death.abilityMainRoi(row), "#60a5fa");
			for (const slot of [0, 1, 2])
				rect(death.abilitySubRoi(row, slot), "#e879f9");
		}
		rect(death.TAG_NAME_OUTER, "#4ade80");
		for (const roi of [
			...death.GATE_BURST_PROBES,
			...death.GATE_PANEL_PROBES,
		]) {
			rect(roi, "#facc15");
		}
		return;
	}
	if (detector === "objective") {
		rect(objective.TIMER_DIGIT_ROI, "#34d399");
		for (const side of [0, 1] as const) {
			rect(objective.SCORE_ROIS[side], "#f87171");
			rect(objective.PENALTY_ROIS[side], "#fb923c");
			rect(objective.PLATE_PROBE_ROIS[side], "#facc15");
		}
		for (const [centers, box, color] of [
			[
				objective.STATUS_SLOT_CENTERS_EVEN,
				objective.STATUS_BODY_BOX_EVEN,
				"#60a5fa",
			],
			[
				objective.STATUS_SLOT_CENTERS_NARROW_RIGHT,
				objective.STATUS_BODY_BOX_NARROW,
				"#e879f9",
			],
		] as const) {
			for (const cx of centers.flat()) {
				rect({ x: cx + box.dx, y: box.y, w: box.w, h: box.h }, color);
			}
		}
		return;
	}
	if (detector === "map-start") {
		rect(mapStart.MODE_LABEL_ROI, "#34d399");
		rect(mapStart.MODE_BLOCK_ROI, "#f87171");
		rect(mapStart.STAGE_ROI, "#60a5fa");
		rect(mapStart.GATE_INK_BAND, "#e879f9");
		for (const roi of mapStart.GATE_DARK_PROBES) rect(roi, "#facc15");
		return;
	}
	if (detector === "scoreboard-own") {
		rect(own.WEAPON_TITLE_BAND, "#f87171");
		for (let row = 0; row < own.GEAR_ROWS; row++) {
			rect(own.gearMainRoi(row), "#60a5fa");
			for (const slot of [0, 1, 2]) rect(own.gearSubRoi(row, slot), "#e879f9");
			rect(own.gateStripProbe(row), "#facc15");
		}
		for (const roi of [
			...own.GATE_PANEL_PROBES,
			...own.GATE_TITLE_TEXT_PROBES,
		]) {
			rect(roi, "#facc15");
		}
		rect(sb.HEADER_LOBBY_BAND, "#34d399");
		rect(sb.HEADER_LINE_BAND, "#34d399");
		return;
	}
	if (detector === "minimap") {
		for (const card of minimap.CARD_LAYOUTS) {
			rect(card.name, "#4ade80");
			rect(card.weapon, "#f87171");
			rect(card.subTile, "#22d3ee");
			for (const [cx, cy] of card.badges)
				rect(minimap.badgeRoi(cx, cy), "#60a5fa");
			rect(card.cross, "#e879f9");
		}
		for (const cy of minimap.ENEMY_ROW_CYS) {
			rect(minimap.enemyWeaponRoi(cy), "#f87171");
			rect(minimap.enemySubTileRoi(cy), "#22d3ee");
			for (const cx of minimap.ENEMY_BADGE_XS)
				rect(minimap.badgeRoi(cx, cy), "#60a5fa");
			rect(minimap.enemyCrossRoi(cy), "#e879f9");
		}
		for (const roi of [
			...minimap.GATE_CLOSE_X_BRIGHT,
			minimap.GATE_SPAWN_BRIGHT,
			...minimap.GATE_CLOSE_DARK_PROBES,
			...minimap.GATE_CLOSE_X_DARK,
			...minimap.GATE_SPAWN_DARK_PROBES,
		]) {
			rect(roi, "#facc15");
		}
		return;
	}
	if (detector === "scoreboard-battle-log") {
		for (const dy of bl.PANEL_DYS) {
			for (const base of bl.ROW_CENTERS) {
				const cy = base + dy;
				rect(bl.weaponRoi(cy), "#f87171");
				rect(bl.nameRoi(cy), "#4ade80");
				rect(bl.paintRoi(cy), "#60a5fa");
				for (const i of [0, 1, 2] as const) rect(bl.statRoi(cy, i), "#e879f9");
				rect(bl.gateDarkProbe(cy), "#facc15");
			}
			rect(bl.teamScoreRoi(dy), "#60a5fa");
			rect(bl.resultTagRoi(dy), "#fb923c");
		}
		for (const roi of bl.MATCH_SCORE_ROIS) rect(roi, "#60a5fa");
		for (const roi of bl.GATE_COLOR_PROBES) rect(roi, "#facc15");
		rect(bl.HEADER_TOP_BAND, "#34d399");
		rect(bl.HEADER_BOTTOM_BAND, "#34d399");
		return;
	}
	if (detector === "scoreboard-battle-log-replay") {
		for (const dx of replay.PANEL_XS) {
			for (const cy of replay.ROW_CENTERS) {
				rect(replay.weaponRoi(cy, dx), "#f87171");
				rect(replay.nameRoi(cy, dx), "#4ade80");
				rect(replay.paintRoi(cy, dx), "#60a5fa");
				for (const i of [0, 1, 2] as const)
					rect(replay.statRoi(cy, dx, i), "#e879f9");
				rect(replay.gateFlatProbe(cy, dx), "#facc15");
			}
			rect(replay.teamScoreRoi(dx), "#60a5fa");
			rect(replay.resultTagRoi(dx), "#fb923c");
		}
		for (const roi of replay.MATCH_SCORE_ROIS) rect(roi, "#60a5fa");
		for (const roi of replay.GATE_GAP_PROBES) rect(roi, "#facc15");
		rect(replay.HEADER_TOP_BAND, "#34d399");
		rect(replay.HEADER_BOTTOM_BAND, "#34d399");
		rect(replay.REPLAY_CODE_ROI, "#34d399");
		return;
	}
	for (const cy of sb.ROW_CENTERS) {
		rect(sb.weaponRoi(cy), "#f87171");
		rect(sb.nameRoi(cy), "#4ade80");
		rect(sb.paintRoi(cy), "#60a5fa");
		for (const i of [0, 1, 2] as const) rect(sb.statRoi(cy, i), "#e879f9");
		rect(sb.gateDarkProbe(cy), "#facc15");
	}
	for (const roi of sb.TEAM_SCORE_ROIS) rect(roi, "#60a5fa");
	for (const roi of sb.MATCH_SCORE_ROIS) rect(roi, "#fb923c");
	for (const roi of sb.GATE_PANEL_PROBES) rect(roi, "#facc15");
	rect(sb.HEADER_LOBBY_BAND, "#34d399");
	rect(sb.HEADER_LINE_BAND, "#34d399");
}

export function ScreenshotPage() {
	const displayRef = useRef<HTMLCanvasElement>(null);
	const clientRef = useRef<AnalyzerClient | null>(null);
	const resultRef = useRef<(r: Result) => void>(() => {});
	const doneRef = useRef<() => void>(() => {});

	const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
	const [results, setResults] = useState<Record<string, Result>>({});
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		clientRef.current = new AnalyzerClient(
			(r) => resultRef.current(r),
			(message) => {
				setError(message);
				setBusy(false);
			},
			() => doneRef.current(),
			// one-shot analyses: re-running the same screenshot must always parse
			{ suppressSteadyFrames: false },
		);
		return () => clientRef.current?.dispose();
	}, []);

	// the detector whose inspector/overlay is shown: the one that fired
	const active = Object.values(results).find((r) => r.events.length > 0);
	const activeDetector = active?.detector ?? "scoreboard";

	useEffect(() => {
		if (!frame) return;
		const display = displayRef.current!;
		display.width = CANONICAL_WIDTH;
		display.height = CANONICAL_HEIGHT;
		const ctx = display.getContext("2d")!;
		ctx.drawImage(frame, 0, 0);
		drawOverlay(ctx, activeDetector);
	}, [frame, activeDetector]);

	const analyze = useCallback(async (file: File | Blob) => {
		// one file at a time: in-flight worker results would land in the next
		// file's state through the shared resultRef otherwise
		if (busyRef.current) return;
		busyRef.current = true;
		setError(null);
		setBusy(true);
		setResults({});
		try {
			const bitmap = await createImageBitmap(file);

			// normalized frame for local crop display, same as the pipeline does
			const norm = document.createElement("canvas");
			norm.width = CANONICAL_WIDTH;
			norm.height = CANONICAL_HEIGHT;
			norm
				.getContext("2d")!
				.drawImage(bitmap, 0, 0, CANONICAL_WIDTH, CANONICAL_HEIGHT);
			setFrame(norm);

			resultRef.current = (r) => {
				setResults((prev) => ({ ...prev, [r.detector]: r }));
			};
			doneRef.current = () => {
				busyRef.current = false;
				setBusy(false);
			};
			const client = clientRef.current!;
			await client.whenReady();
			if (!client.analyze(bitmap, 0)) {
				busyRef.current = false;
				setBusy(false);
			}
		} catch (e) {
			setError(String(e));
			busyRef.current = false;
			setBusy(false);
		}
	}, []);

	// frame handed off from an Inspect click in another browser tab; the
	// handoff write races this tab's load, so the claim polls briefly
	const [inspectKey, setInspectKey] = useSearchParam(
		scannerSearchParams,
		"inspect",
	);
	useEffect(() => {
		if (!inspectKey) return;
		setInspectKey(null);
		claimInspectFrame(inspectKey).then(
			(frame) => {
				if (frame) void analyze(frame);
				else
					setError(
						"Inspected frame did not arrive — go back to the other tab and press Inspect again",
					);
			},
			(e) => setError(String(e)),
		);
	}, [inspectKey, setInspectKey, analyze]);

	const event = active?.events[0] as DetectedEvent<CardData> | undefined;
	const rows = (event?.debug?.rows ?? []) as ScoreboardRowDebug[];
	const isReplay = activeDetector === "scoreboard-battle-log-replay";
	const isScoreboardBattleLog = activeDetector === "scoreboard-battle-log";
	const isDeath = activeDetector === "death";
	const isMapStart = activeDetector === "map-start";
	const isOwn = activeDetector === "scoreboard-own";
	const isMinimap = activeDetector === "minimap";
	const isObjective = activeDetector === "objective";
	const winnerSide = String(event?.debug?.winnerSide ?? "left");
	const rowRois = isReplay
		? replayRows(winnerSide)
		: isScoreboardBattleLog
			? battleLogRows(winnerSide)
			: scoreboardRows();

	return (
		<div>
			<ScannerDropzone onFile={(file) => void analyze(file)}>
				Drop a frame (PNG/JPEG) here, or{" "}
				<label>
					pick a file
					<input
						type="file"
						accept="image/png,image/jpeg"
						style={{ display: "none" }}
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = ""; // allow re-picking the same file
							if (file) void analyze(file);
						}}
					/>
				</label>
				{busy ? " — analyzing…" : null}
			</ScannerDropzone>
			{error ? <p className="text-error">{error}</p> : null}

			<div
				className={styles.frame}
				style={{ display: frame ? "block" : "none" }}
			>
				<canvas ref={displayRef} />
			</div>

			{frame && !busy ? (
				<p>
					<button
						type="button"
						onClick={() =>
							downloadExpectedJson(event?.data ?? null, event?.type)
						}
					>
						Download expected.json
					</button>{" "}
					<button
						type="button"
						disabled={!event}
						onClick={() =>
							downloadEventsCsv(
								"screenshot-events.csv",
								Object.values(results).flatMap((r) => r.events),
							)
						}
					>
						Download CSV
					</button>
				</p>
			) : null}

			{Object.keys(results).length > 0 ? (
				<div className={styles.gateList}>
					{Object.values(results).map((result) => (
						<div
							key={result.detector}
							className={clsx(styles.gateRow, {
								[styles.fired]: result.gate.pass,
							})}
						>
							<span className={styles.gateBadge}>
								{result.gate.pass ? "fired" : "no fire"}
							</span>
							<span className={styles.gateName}>{result.detector}</span>
							<span className={styles.gateScore}>
								{result.gate.score.toFixed(3)}
							</span>
							<span className={styles.gateNote}>{gateSummary(result)}</span>
						</div>
					))}
				</div>
			) : null}

			{frame && event && isReplay ? (
				<div className={styles.detail}>
					<div className={styles.detailStats}>
						<Stat label="timestamp">{event.data.timestamp ?? "?"}</Stat>
						<Stat label="code" raw={event.debug?.codeRaw}>
							{event.data.replayCode ?? "?"}
						</Stat>
						<Stat label="match scores">
							{JSON.stringify(event.data.matchScores)}
						</Stat>
						<Stat label="winner panel">{winnerSide}</Stat>
					</div>
					<div className={styles.detailCrops}>
						<LabeledCrop
							label="header"
							frame={frame}
							roi={replay.HEADER_TOP_BAND}
						/>
						<LabeledCrop
							label="replay code"
							frame={frame}
							roi={replay.REPLAY_CODE_ROI}
						/>
					</div>
				</div>
			) : null}

			{frame && event && isScoreboardBattleLog ? (
				<div className={styles.detail}>
					<div className={styles.detailStats}>
						<Stat label="timestamp">{event.data.timestamp ?? "?"}</Stat>
						<Stat label="match scores">
							{JSON.stringify(event.data.matchScores)}
						</Stat>
						<Stat label="winner panel">{winnerSide}</Stat>
					</div>
					<div className={styles.detailCrops}>
						<LabeledCrop
							label="header top"
							frame={frame}
							roi={bl.HEADER_TOP_BAND}
						/>
						<LabeledCrop
							label="header bottom"
							frame={frame}
							roi={bl.HEADER_BOTTOM_BAND}
						/>
					</div>
				</div>
			) : null}

			{frame && event && isDeath ? (
				<div className={styles.detail}>
					{(() => {
						const data = event.data as unknown as DeathData;
						return (
							<>
								<div className={styles.detailStats}>
									<Stat label="weapon" raw={event.debug?.weaponRaw}>
										{weaponLabel(data.weaponType, data.weaponId) ?? "?"}
									</Stat>
									<Stat label="name" raw={event.debug?.nameRaw}>
										{data.name ?? "?"}
									</Stat>
									<Stat label="abilities">
										{data.abilities.map((row) => row.join(" ")).join(" | ")}
									</Stat>
								</div>
								<div className={styles.detailCrops}>
									<LabeledCrop
										label="weapon line"
										frame={frame}
										roi={death.WEAPON_LINE_ROI}
									/>
									<LabeledCrop
										label="name tag"
										frame={frame}
										roi={death.TAG_NAME_OUTER}
									/>
								</div>
							</>
						);
					})()}
				</div>
			) : null}

			{frame && event && isMapStart ? (
				<div className={styles.detail}>
					{(() => {
						const data = event.data as unknown as MapStartData;
						return (
							<>
								<div className={styles.detailStats}>
									<Stat label="mode" raw={event.debug?.modeReading}>
										{modeLabel(data.mode) ?? "?"}
									</Stat>
									<Stat label="stage" raw={event.debug?.stageReading}>
										{stageLabel(data.stage) ?? "?"}
									</Stat>
								</div>
								<div className={styles.detailCrops}>
									<LabeledCrop
										label="mode block"
										frame={frame}
										roi={mapStart.MODE_BLOCK_ROI}
										scale={0.75}
									/>
									<LabeledCrop
										label="stage"
										frame={frame}
										roi={mapStart.STAGE_ROI}
									/>
								</div>
							</>
						);
					})()}
				</div>
			) : null}

			{frame && event && isOwn ? (
				<div className={styles.detail}>
					{(() => {
						const data = event.data as unknown as ScoreboardOwnData;
						return (
							<>
								<div className={styles.detailStats}>
									<Stat label="weapon" raw={event.debug?.weaponReading}>
										{mainWeaponLabel(data.weaponId) ?? "?"}
									</Stat>
									<Stat label="abilities">
										{data.abilities.map((row) => row.join(" ")).join(" | ")}
									</Stat>
								</div>
								<div className={styles.detailCrops}>
									<LabeledCrop
										label="title band"
										frame={frame}
										roi={own.WEAPON_TITLE_BAND}
									/>
									{[0, 1, 2].map((row) => (
										<LabeledCrop
											key={row}
											label={`gear ${row + 1}`}
											frame={frame}
											roi={{
												x: own.GEAR_MAIN_CXS[row]! - 36,
												y: own.GEAR_BADGE_CY - 32,
												w: 200,
												h: 64,
											}}
										/>
									))}
								</div>
							</>
						);
					})()}
				</div>
			) : null}

			{frame && event && isMinimap ? (
				<div className={styles.detail}>
					{(() => {
						const data = event.data as unknown as MinimapData;
						return (
							<>
								<div className={styles.detailStats}>
									<Stat label="stage">{stageLabel(data.stage) ?? "?"}</Stat>
									<Stat label="view">
										{data.spectator ? "spectator map" : "POV overlay"}
									</Stat>
									<Stat label="team">
										{data.teammates
											.map(
												(p) =>
													`${p.slot}: ${p.name ?? "?"} (${mainWeaponLabel(p.weaponId) ?? "?"})${playerFlags(p)}`,
											)
											.join(", ") || "—"}
									</Stat>
									{data.enemies.length > 0 ? (
										<Stat label="enemies">
											{data.enemies
												.map(
													(p) =>
														`${p.name ?? "?"} (${mainWeaponLabel(p.weaponId) ?? "?"})${playerFlags(p)}`,
												)
												.join(", ")}
										</Stat>
									) : null}
								</div>
								{!data.spectator ? (
									<div className={styles.detailCrops}>
										{minimap.CARD_LAYOUTS.map((card) => (
											<LabeledCrop
												key={card.slot}
												label={`slot ${card.slot}`}
												frame={frame}
												roi={card.name}
											/>
										))}
									</div>
								) : null}
							</>
						);
					})()}
				</div>
			) : null}

			{frame && event && isObjective ? (
				<div className={styles.detail}>
					{(() => {
						const data = event.data as unknown as ObjectiveData;
						const status = active?.events.find(
							(e) => e.type === PLAYER_STATUS_EVENT_TYPE,
						) as DetectedEvent<PlayerStatusData> | undefined;
						return (
							<>
								<div className={styles.detailStats}>
									<Stat label="timer">{formatTimer(data.time)}</Stat>
									<Stat label="score">
										{data.score[0] ?? "?"}–{data.score[1] ?? "?"}
									</Stat>
									<Stat label="penalty">
										{data.penalty[0] ?? "—"} / {data.penalty[1] ?? "—"}
									</Stat>
									<Stat label="control">
										{data.control[0]
											? "left"
											: data.control[1]
												? "right"
												: "none"}
									</Stat>
									{status ? (
										<>
											<Stat label="layout">{status.data.layout}</Stat>
											<Stat label="players">
												<StatusSlots data={status.data} />
											</Stat>
										</>
									) : null}
								</div>
								<div className={styles.detailCrops}>
									<LabeledCrop
										label="left count"
										frame={frame}
										roi={objective.SCORE_ROIS[0]}
									/>
									<LabeledCrop
										label="timer"
										frame={frame}
										roi={objective.TIMER_DIGIT_ROI}
									/>
									<LabeledCrop
										label="right count"
										frame={frame}
										roi={objective.SCORE_ROIS[1]}
									/>
									{status
										? ([0, 1] as const).map((side) => (
												<LabeledCrop
													key={side}
													label={side === 0 ? "left team" : "right team"}
													frame={frame}
													roi={statusStripRoi(status.data.layout, side)}
													scale={0.75}
												/>
											))
										: null}
								</div>
							</>
						);
					})()}
				</div>
			) : null}

			{frame &&
			event &&
			!isDeath &&
			!isMapStart &&
			!isOwn &&
			!isMinimap &&
			!isObjective ? (
				<table className={styles.inspector}>
					<thead>
						<tr>
							<th>row</th>
							<th>weapon crop</th>
							<th>top candidates</th>
							<th>name</th>
							<th>paint</th>
							<th>stats (splats / deaths / specials)</th>
						</tr>
					</thead>
					<tbody>
						{rowRois.map((roi, i) => {
							const player = event.data.players[i];
							const dbg = rows[i];
							return (
								<tr key={i}>
									<td>{i}</td>
									<td>
										<RoiCrop frame={frame} roi={roi.weapon} />
									</td>
									<td>
										<div
											className={clsx(
												styles.candidates,
												styles.weaponCandidates,
											)}
										>
											{dbg?.weapon?.top.map((c) => (
												<span className={styles.candidate} key={c.id}>
													<img
														className={styles.weaponIcon}
														src={`${mainWeaponImageUrl(Number(c.id) as MainWeaponId)}.avif`}
														alt={c.id}
													/>
													{c.id}
													<span className="text-xxs text-lighter">
														{c.score.toFixed(3)}
													</span>
												</span>
											))}
										</div>
									</td>
									<td>
										<RoiCrop frame={frame} roi={roi.name} />
										<b>{player?.name || "—"}</b>{" "}
										<span className="text-xxs text-lighter">
											{dbg?.nameScore.toFixed(3)}
										</span>
									</td>
									<td>
										<RoiCrop frame={frame} roi={roi.paint} />
										<b>{player?.paint ?? "—"}</b>{" "}
										<span className="text-xxs text-lighter">
											{dbg?.paintScore.toFixed(3)}
										</span>
									</td>
									<td>
										<div className={styles.candidates}>
											{([0, 1, 2] as const).map((s) => (
												<span className={styles.candidate} key={s}>
													<RoiCrop frame={frame} roi={roi.stats[s]} scale={2} />
													<b>{[player?.ka, player?.d, player?.s][s] ?? "—"}</b>
													<span className="text-xxs text-lighter">
														{dbg?.statScores[s].toFixed(2)}
													</span>
												</span>
											))}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			) : null}
		</div>
	);
}
