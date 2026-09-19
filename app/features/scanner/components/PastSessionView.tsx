/** A past live session: date, range and numbers over the shared SessionView, with Delete session. */
import { Trash2 } from "lucide-react";
import { SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { useUser } from "~/features/auth/core/user";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
import { scannerSearchParams } from "../scanner-search-params";
import { deleteEvents, loadEventFrame } from "../store/events";
import { useClips } from "./clips-feed";
import { ExportMenu } from "./ExportMenu";
import { findSession, refreshFeed, useFeed } from "./events-feed";
import { NotFound } from "./NotFound";
import styles from "./PastSessionView.module.css";
import { SessionHeader } from "./SessionHeader";
import { SessionView } from "./SessionView";
import { sessionLabel } from "./SettingsPopover";
import { matchContaining } from "./sendou-ingest";
import type { ScanEvent } from "./session-data";
import { sendLive } from "./upload";

export function PastSessionView() {
	const [id] = useSearchParam(scannerSearchParams, "id");
	const [, setParams] = useSearchParamsTyped(scannerSearchParams);
	const feed = useFeed();
	const clips = useClips();
	const user = useUser();

	const session = id === null ? null : findSession(feed, id);
	if (!session) {
		return feed.loaded ? (
			<NotFound>This session is gone — sessions are kept for 30 days.</NotFound>
		) : null;
	}
	const sessionClips = clips.filter(
		(clip) =>
			clip.bucket !== "vod" &&
			clip.source.kind === "live" &&
			clip.source.sessionKey === session.key,
	);

	const remove = async () => {
		await deleteEvents(
			session.events
				.map((event) => event.id)
				.filter((eventId): eventId is number => eventId !== undefined),
		);
		refreshFeed();
		setParams({ view: "home" });
	};

	return (
		<SessionView
			kind="session"
			events={session.events}
			originT={session.originT}
			clips={sessionClips}
			clipsTitle="Clips"
			running={false}
			canUpload={Boolean(user)}
			onUpload={(built) => {
				const eventId = built.sources[0]?.id;
				if (eventId !== undefined) void sendLive(matchContaining(eventId));
			}}
			getFrame={frameLoader}
			emptyText="No games were read in this session."
			header={(info) => (
				<SessionHeader
					actions={
						<>
							<ExportMenu
								built={info.built}
								events={session.events}
								source={{
									label: sessionLabel(session.startedAt),
									originT: session.originT,
								}}
								clipCounts={info.clipCounts}
								fileBase={`scanner-${new Date(session.startedAt).toISOString().slice(0, 10)}`}
							/>
							<FormWithConfirm
								dialogHeading="Delete this session?"
								description="Its games and frames are removed from this browser. Clips stay in the clip history."
								onConfirm={() => void remove()}
							>
								<SendouButton
									size="small"
									variant="destructive"
									icon={<Trash2 />}
								>
									Delete session
								</SendouButton>
							</FormWithConfirm>
						</>
					}
				>
					<div className={styles.title}>
						<LocaleTimeRange
							from={new Date(session.startedAt)}
							to={new Date(session.endedAt)}
							options={{ dateStyle: "medium", timeStyle: "short" }}
							inline
						/>
						{info.summaryLine ? (
							<span className={styles.summary}> · {info.summaryLine}</span>
						) : null}
					</div>
				</SessionHeader>
			)}
		/>
	);
}

function frameLoader(event: ScanEvent) {
	return event.hasFrame && event.id !== undefined
		? () => loadEventFrame(event.id!)
		: undefined;
}
