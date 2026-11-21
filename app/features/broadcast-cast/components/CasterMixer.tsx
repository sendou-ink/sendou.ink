import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import type { BroadcastAudioFeed } from "~/features/broadcast/broadcast-types";
import type * as AudioFeeds from "~/features/broadcast/core/AudioFeeds";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { BROADCAST_VOLUME_SAVE_INTERVAL_MS } from "../broadcast-cast-constants";
import { broadcastActionSchema } from "../broadcast-cast-schemas";
import type { BroadcastCaster } from "../broadcast-cast-types";
import styles from "./CasterMixer.module.css";

/** Loudness (as VDO.ninja reports it, after the fader) the meter is full at, leaving headroom over a caster speaking up. */
const FULL_METER_LOUDNESS = 100;
/** How long a released fader keeps its value at most while waiting for the state with it saved. */
const RELEASED_VOLUME_HOLD_MS = 3000;
const NO_FEEDS: ReadonlyMap<number, BroadcastAudioFeed> = new Map();

type FeedStatus = "connected" | "disconnected" | "unknown";

/**
 * A strip per caster with a VDO.ninja link: their volume on air, changed as the fader moves, next to how loud they
 * are on air (what OBS hears of them at that volume), to match the casters' levels by. One whose stream is down
 * stands out, so a dropped caster is noticed before going back on air.
 */
export function CasterMixer({
	casters,
	feedStore,
	ref,
}: {
	casters: BroadcastCaster[];
	feedStore: AudioFeeds.Store;
	ref?: React.Ref<HTMLElement>;
}) {
	const { t } = useTranslation(["broadcast"]);
	const feeds = useFeeds(feedStore);
	const castersOnFeed = casters.filter((caster) => caster.vdoNinjaUrl);

	if (castersOnFeed.length === 0) return null;

	return (
		<section
			ref={ref}
			className="stack sm"
			aria-label={t("broadcast:dashboard.mixer.header")}
		>
			<span className="text-sm font-semi-bold">
				{t("broadcast:dashboard.mixer.header")}
			</span>
			<div className={styles.mixer}>
				{castersOnFeed.map((caster) => (
					<CasterStrip
						key={caster.userId}
						caster={caster}
						feed={feeds.get(caster.userId) ?? null}
					/>
				))}
			</div>
		</section>
	);
}

/** Warns of the casters whose VDO.ninja stream OBS hears as down, nothing while every one is connected. */
export function CasterFeedsHealth({
	casters,
	feedStore,
	onClick,
}: {
	casters: BroadcastCaster[];
	feedStore: AudioFeeds.Store;
	onClick: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);
	const feeds = useFeeds(feedStore);
	const disconnected = casters.filter(
		(caster) =>
			caster.vdoNinjaUrl &&
			feedStatus(feeds.get(caster.userId)) === "disconnected",
	);

	if (disconnected.length === 0) return null;

	return (
		<SendouButton
			size="small"
			variant="outlined-destructive"
			icon={<TriangleAlert />}
			onClick={onClick}
			testId="broadcast-casters-disconnected"
		>
			{t("broadcast:dashboard.health.castersDisconnected", {
				names: disconnected.map((caster) => caster.name).join(", "),
			})}
		</SendouButton>
	);
}

function CasterStrip({
	caster,
	feed,
}: {
	caster: BroadcastCaster;
	feed: BroadcastAudioFeed | null;
}) {
	const { t } = useTranslation(["broadcast"]);
	const status = feedStatus(feed);

	return (
		<div
			className={styles.strip}
			data-status={status}
			data-testid={`broadcast-caster-strip-${caster.userId}`}
		>
			<Fader caster={caster} loudness={feed?.isConnected ? feed.loudness : 0} />
			<span className={clsx(styles.name, "truncate")} title={caster.name}>
				{caster.name}
			</span>
			<span className={styles.status}>
				{t(`broadcast:dashboard.mixer.${status}`)}
			</span>
		</div>
	);
}

/**
 * The caster's volume next to their level meter, saved (at most every so often) as it moves without saving the
 * casters form. VDO.ninja measures the caster before the volume, so the meter applies the fader itself, following it
 * as it moves.
 */
function Fader({
	caster,
	loudness,
}: {
	caster: BroadcastCaster;
	loudness: number;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	// the fader's value while it is moved and after, until the state with it saved arrives
	const [draft, setDraft] = React.useState<{
		volume: number;
		isReleased: boolean;
	} | null>(null);
	const lastSaveAt = React.useRef(0);
	const pendingSave = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const volume =
		draft && (!draft.isReleased || draft.volume !== caster.volume)
			? draft.volume
			: caster.volume;
	const level = R.clamp((loudness * volume) / 100 / FULL_METER_LOUDNESS, {
		min: 0,
		max: 1,
	});

	const save = (newVolume: number) => {
		if (pendingSave.current) clearTimeout(pendingSave.current);
		pendingSave.current = null;
		lastSaveAt.current = Date.now();
		submit("SET_CASTER_VOLUME", { userId: caster.userId, volume: newVolume });
	};

	const change = (newVolume: number) => {
		setDraft({ volume: newVolume, isReleased: false });

		const sinceLastSave = Date.now() - lastSaveAt.current;
		if (sinceLastSave >= BROADCAST_VOLUME_SAVE_INTERVAL_MS) {
			save(newVolume);
		} else {
			if (pendingSave.current) clearTimeout(pendingSave.current);
			pendingSave.current = setTimeout(
				() => save(newVolume),
				BROADCAST_VOLUME_SAVE_INTERVAL_MS - sinceLastSave,
			);
		}
	};

	const release = () => {
		if (!draft || draft.isReleased) return;

		if (pendingSave.current) save(draft.volume);
		const released = { ...draft, isReleased: true };
		setDraft(released);
		// a save that never comes back (or a volume changed by someone else since) shows the saved volume after all
		setTimeout(
			() => setDraft((current) => (current === released ? null : current)),
			RELEASED_VOLUME_HOLD_MS,
		);
	};

	return (
		<>
			<div className={styles.channels}>
				<div
					className={styles.meter}
					style={{ "--level": level } as React.CSSProperties}
					data-testid={`broadcast-caster-meter-${caster.userId}`}
					aria-hidden
				>
					<div className={styles.meterLevel} />
				</div>
				<input
					type="range"
					className={styles.fader}
					min={0}
					max={100}
					value={volume}
					onChange={(event) => change(Number(event.target.value))}
					onPointerUp={release}
					onKeyUp={release}
					onBlur={release}
					aria-label={t("broadcast:dashboard.mixer.volume", {
						name: caster.name,
					})}
					data-testid={`broadcast-caster-volume-${caster.userId}`}
				/>
			</div>
			<span className={styles.volume}>{volume}%</span>
		</>
	);
}

function useFeeds(feedStore: AudioFeeds.Store) {
	return React.useSyncExternalStore(
		feedStore.subscribe,
		feedStore.getSnapshot,
		() => NO_FEEDS,
	);
}

/** `unknown` while no OBS page reports the caster, e.g. none is open. */
function feedStatus(feed: BroadcastAudioFeed | null | undefined): FeedStatus {
	if (!feed) return "unknown";

	return feed.isConnected ? "connected" : "disconnected";
}
