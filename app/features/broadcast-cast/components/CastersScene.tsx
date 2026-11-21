import { Video } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { BroadcastClipsContext } from "~/features/broadcast/broadcast-clips-context";
import { BROADCAST_CANVAS } from "~/features/broadcast/broadcast-constants";
import type {
	BroadcastAudioFeed,
	BroadcastView,
} from "~/features/broadcast/broadcast-types";
import { combineStyles } from "~/features/broadcast/broadcast-utils";
import type { BroadcastSceneLayer } from "~/features/broadcast/components/BroadcastOverlay";
import type {
	BroadcastCaster,
	CastBroadcastState,
} from "../broadcast-cast-types";
import {
	pronounsLabel,
	scenePart,
	vdoNinjaEmbedUrl,
} from "../broadcast-cast-utils";
import * as VdoNinjaMessage from "../core/VdoNinjaMessage";
import layout from "./CastersScene.layout.module.css";
import look from "./CastersScene.module.css";
import { Matchup } from "./Matchup";
import { SceneBackdrop } from "./SceneBackdrop";

const styles = combineStyles(look, layout);

const part = scenePart("casters");
const camerasPart = scenePart("cameras");

/** Loudness (as VDO.ninja reports it) a caster is speaking at, the level its own active speaker detection goes by. */
const SPEAKING_LOUDNESS = 10;
/** Loudness over {@link SPEAKING_LOUDNESS} the speaking ring is at its biggest. */
const SPEAKING_LOUDNESS_RANGE = 40;
/** How long a caster still counts as speaking after the last loud read, so the ring doesn't flicker between words. */
const SPEAKING_HOLD_MS = 400;
/** How often the program reports the casters' feeds to the dashboards, their loudest read in between. */
const FEED_REPORT_INTERVAL_MS = 150;
/** How often the embed is asked whether the caster's stream is connected, on top of it telling as it (dis)connects. */
const CONNECTION_POLL_INTERVAL_MS = 2_000;

/** Frames when no casters are named, the usual duo. */
const DEFAULT_FRAME_COUNT = 2;

/** Where the camera frames are by how many casters there are, on the 1920×1080 canvas. */
const FRAME_LAYOUTS: Record<number, Frame[]> = {
	1: [{ x: 400, y: 200, w: 1120 }],
	2: [
		{ x: 120, y: 220, w: 820 },
		{ x: 980, y: 220, w: 820 },
	],
	3: [
		{ x: 80, y: 260, w: 560 },
		{ x: 680, y: 260, w: 560 },
		{ x: 1280, y: 260, w: 560 },
	],
};

interface Frame {
	x: number;
	y: number;
	w: number;
}

/**
 * Full screen with see-through 16:9 frames for the casters' cameras, their names under them. What a named caster's
 * frame shows comes from {@link CasterCameras} under the scene, the frames of no one named are left to OBS sources under
 * the overlay.
 */
export function CastersScene({
	state,
	view,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast"]);
	const casters = state.casters;
	const frames = framesOf(casters);

	return (
		<div className={styles.casters}>
			<div className={styles.backdrop} style={cutOut(frames)}>
				<SceneBackdrop />
			</div>
			<header className={styles.header} {...part("header")}>
				<div className={styles.eyebrow} {...part("tournament-name")}>
					{state.tournament.name}
				</div>
				<h1 className={styles.title} {...part("title")}>
					{t("broadcast:overlay.title.casters")}
				</h1>
			</header>
			{frames.map((frame, i) => (
				<div
					key={i}
					className={styles.frame}
					style={{ ...frameStyle(frame), "--i": i } as React.CSSProperties}
					{...part("camera")}
				>
					{casters[i] ? (
						<div className={styles.name} {...part("caster-name")}>
							<span className={styles.nameText}>{casters[i].name}</span>
							{casters[i].pronouns ? (
								<span className={styles.pronouns} {...part("caster-pronouns")}>
									{pronounsLabel(casters[i].pronouns)}
								</span>
							) : null}
						</div>
					) : null}
				</div>
			))}
			{state.match && frames.length > 1 ? (
				<div className={styles.matchup}>
					<Matchup match={state.match} view={view} producer={state[view]} />
				</div>
			) : null}
		</div>
	);
}

/**
 * What shows through the casters scene's frames, under the scenes: each caster's VDO.ninja camera, or their avatar
 * lighting up as they speak when they're audio only or have no VDO.ninja link. Mounted on every scene so the casters
 * stay connected and are heard all show long, only seen while the casters scene is. Outside OBS (the dashboard's
 * previews, the designer) nothing connects nor plays sound: a placeholder stands in for each camera. In OBS how
 * loud each caster is and whether they're connected goes to the dashboards' mixer.
 */
export function CasterCameras({
	state,
	view,
	layers,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
	layers: BroadcastSceneLayer<CastBroadcastState>[];
}) {
	const frames = framesOf(state.casters);
	const feeds = useFeedReports(state.casters);
	const castersLayer = layers.find(
		(layer) => layer.state[view].scene === "casters",
	);

	return (
		<div
			className={styles.cameras}
			data-transition={castersLayer?.transition}
			data-hidden={!castersLayer || undefined}
			aria-hidden={!castersLayer || undefined}
		>
			{state.casters.map((caster, i) =>
				frames[i] ? (
					<div
						key={caster.userId}
						className={styles.camera}
						style={frameStyle(frames[i])}
						{...camerasPart("caster-camera")}
					>
						<CasterFeed
							caster={caster}
							onLoudness={(loudness) =>
								feeds.hearLoudness(caster.userId, loudness)
							}
							onConnection={(isConnected) =>
								feeds.hearConnection(caster.userId, isConnected)
							}
						/>
					</div>
				) : null,
			)}
		</div>
	);
}

/**
 * Reports what the program hears of each caster with a VDO.ninja link to the dashboards a few times a second: their
 * loudest read since the last report and whether their stream is connected. The previews and the designer, which
 * connect to no one, report nothing.
 */
function useFeedReports(casters: BroadcastCaster[]) {
	const { isMuted, reportFeeds } = React.useContext(BroadcastClipsContext);
	const heard = React.useRef(
		new Map<number, { isConnected: boolean; loudness: number }>(),
	);
	const latest = React.useRef({ casters, reportFeeds });
	React.useLayoutEffect(() => {
		latest.current = { casters, reportFeeds };
	});

	React.useEffect(() => {
		if (isMuted) return;

		const interval = setInterval(() => {
			const feeds: BroadcastAudioFeed[] = [];
			for (const caster of latest.current.casters) {
				if (!caster.vdoNinjaUrl) continue;

				const heardCaster = heard.current.get(caster.userId);
				feeds.push({
					id: caster.userId,
					isConnected: heardCaster?.isConnected ?? false,
					loudness: heardCaster?.loudness ?? 0,
				});
				if (heardCaster) heardCaster.loudness = 0;
			}
			latest.current.reportFeeds(feeds);
		}, FEED_REPORT_INTERVAL_MS);

		return () => clearInterval(interval);
	}, [isMuted]);

	const heardOf = (userId: number) => {
		let caster = heard.current.get(userId);
		if (!caster) {
			caster = { isConnected: false, loudness: 0 };
			heard.current.set(userId, caster);
		}

		return caster;
	};

	return {
		hearLoudness(userId: number, loudness: number) {
			const caster = heardOf(userId);
			caster.loudness = Math.max(caster.loudness, loudness);
		},
		hearConnection(userId: number, isConnected: boolean) {
			heardOf(userId).isConnected = isConnected;
		},
	};
}

function CasterFeed({
	caster,
	onLoudness,
	onConnection,
}: {
	caster: BroadcastCaster;
	onLoudness: (loudness: number) => void;
	onConnection: (isConnected: boolean) => void;
}) {
	const { isMuted } = React.useContext(BroadcastClipsContext);
	const [isSpeaking, setIsSpeaking] = React.useState(false);
	const ringRef = React.useRef<HTMLDivElement>(null);
	const quietTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const ringLoudness = (loudness: number) => {
		ringRef.current?.style.setProperty(
			"--caster-level",
			String(speakingLevel(loudness)),
		);
		if (loudness < SPEAKING_LOUDNESS) return;

		setIsSpeaking(true);
		if (quietTimeout.current) clearTimeout(quietTimeout.current);
		quietTimeout.current = setTimeout(
			() => setIsSpeaking(false),
			SPEAKING_HOLD_MS,
		);
	};

	if (!caster.vdoNinjaUrl) {
		return <CasterAvatar caster={caster} isSpeaking={false} />;
	}

	if (!caster.isAudioOnly) {
		return isMuted ? (
			<CameraPlaceholder caster={caster} />
		) : (
			<VdoNinjaEmbed
				key={caster.vdoNinjaUrl}
				caster={caster}
				vdoNinjaUrl={caster.vdoNinjaUrl}
				isAudioOnly={false}
				onLoudness={onLoudness}
				onConnection={onConnection}
			/>
		);
	}

	return (
		<>
			{isMuted ? null : (
				<VdoNinjaEmbed
					key={`${caster.vdoNinjaUrl}-audio`}
					caster={caster}
					vdoNinjaUrl={caster.vdoNinjaUrl}
					isAudioOnly
					onLoudness={(loudness) => {
						ringLoudness(loudness);
						onLoudness(loudness);
					}}
					onConnection={onConnection}
				/>
			)}
			<CasterAvatar caster={caster} isSpeaking={isSpeaking} ringRef={ringRef} />
		</>
	);
}

/**
 * The caster's VDO.ninja view link playing in the frame (only their sound when audio only), telling how loud they are
 * and whether their stream is connected.
 */
function VdoNinjaEmbed({
	caster,
	vdoNinjaUrl,
	isAudioOnly,
	onLoudness,
	onConnection,
}: {
	caster: BroadcastCaster;
	vdoNinjaUrl: string;
	isAudioOnly: boolean;
	onLoudness: (loudness: number) => void;
	onConnection: (isConnected: boolean) => void;
}) {
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	// a new src would connect again, so later volume changes are posted to it instead
	const [src] = React.useState(() =>
		vdoNinjaEmbedUrl({ url: vdoNinjaUrl, volume: caster.volume, isAudioOnly }),
	);
	const origin = new URL(src).origin;
	const listeners = React.useRef({ onLoudness, onConnection });
	React.useLayoutEffect(() => {
		listeners.current = { onLoudness, onConnection };
	});

	React.useEffect(() => {
		iframeRef.current?.contentWindow?.postMessage(
			{ volume: caster.volume / 100 },
			origin,
		);
	}, [caster.volume, origin]);

	React.useEffect(() => {
		listeners.current.onConnection(false);

		const onMessage = (event: MessageEvent) => {
			if (event.source !== iframeRef.current?.contentWindow) return;

			const message = VdoNinjaMessage.parse(event.data);
			if (message?.type === "loudness") {
				listeners.current.onLoudness(message.loudness);
			} else if (message?.type === "connection") {
				listeners.current.onConnection(message.isConnected);
			}
		};
		// it tells as the stream (dis)connects, asked too so a missed message doesn't stick
		const poll = setInterval(
			() =>
				iframeRef.current?.contentWindow?.postMessage(
					{ getStreamIDs: true },
					origin,
				),
			CONNECTION_POLL_INTERVAL_MS,
		);

		window.addEventListener("message", onMessage);
		return () => {
			window.removeEventListener("message", onMessage);
			clearInterval(poll);
		};
	}, [origin]);

	return (
		<iframe
			ref={iframeRef}
			src={src}
			title={caster.name}
			className={styles.cameraVideo}
			allow="autoplay"
			// VDO.ninja's page runs its own scripts on its own origin to connect, nothing more
			sandbox="allow-scripts allow-same-origin"
			onLoad={() =>
				iframeRef.current?.contentWindow?.postMessage(
					{ getLoudness: true },
					origin,
				)
			}
		/>
	);
}

function CasterAvatar({
	caster,
	isSpeaking,
	ringRef,
}: {
	caster: BroadcastCaster;
	isSpeaking: boolean;
	ringRef?: React.Ref<HTMLDivElement>;
}) {
	return (
		<div
			className={styles.audio}
			data-speaking={isSpeaking || undefined}
			{...camerasPart("caster-audio")}
		>
			<div
				ref={ringRef}
				className={styles.speakingRing}
				{...camerasPart("caster-speaking-ring")}
			/>
			{caster.avatarUrl ? (
				<img
					className={styles.avatar}
					src={caster.avatarUrl}
					alt=""
					{...camerasPart("caster-avatar")}
				/>
			) : (
				<div className={styles.avatar} {...camerasPart("caster-avatar")}>
					{caster.name.slice(0, 1).toUpperCase()}
				</div>
			)}
		</div>
	);
}

function CameraPlaceholder({ caster }: { caster: BroadcastCaster }) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div
			className={styles.cameraPlaceholder}
			{...camerasPart("caster-camera-placeholder")}
		>
			<Video className={styles.cameraPlaceholderIcon} />
			<span className={styles.cameraPlaceholderLabel}>
				{t("broadcast:overlay.cameraPlaceholder", { name: caster.name })}
			</span>
		</div>
	);
}

/** 0-1, how far over speaking the loudness VDO.ninja reports is, what the speaking ring grows by. */
function speakingLevel(loudness: number) {
	return R.clamp((loudness - SPEAKING_LOUDNESS) / SPEAKING_LOUDNESS_RANGE, {
		min: 0,
		max: 1,
	});
}

function framesOf(casters: BroadcastCaster[]) {
	return FRAME_LAYOUTS[casters.length] ?? FRAME_LAYOUTS[DEFAULT_FRAME_COUNT];
}

function frameHeight(frame: Frame) {
	return Math.round((frame.w * 9) / 16);
}

function frameStyle(frame: Frame): React.CSSProperties {
	return {
		left: frame.x,
		top: frame.y,
		width: frame.w,
		height: frameHeight(frame),
	};
}

/** Cuts the frames out of the backdrop, so the cameras under the overlay show through them. */
function cutOut(frames: Frame[]): React.CSSProperties {
	const holes = frames
		.map(
			(frame) =>
				`M${frame.x} ${frame.y}h${frame.w}v${frameHeight(frame)}h${-frame.w}Z`,
		)
		.join("");

	return {
		clipPath: `path(evenodd, "M0 0H${BROADCAST_CANVAS.width}V${BROADCAST_CANVAS.height}H0Z${holes}")`,
	};
}
