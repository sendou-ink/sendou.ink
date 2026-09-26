/**
 * `⇩ CSV` in a session header: `Matches` (one row per game, the rows the
 * cards render) or `Raw detections` (one row per event), for this session
 * or file. A compacted session no longer has its raw detections, so that
 * option is disabled rather than exporting the few events compaction kept.
 */
import { Download, FileText, ListTree } from "lucide-react";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { eventsToCsv } from "../core/csv/events";
import { type MatchCsvSource, matchesToCsv } from "../core/csv/matches";
import type { BuiltMatch } from "../core/match-builder";
import { SESSION_COMPACT_AFTER_MS } from "../core/sessions";
import { downloadCsv } from "./download";
import type { ScanEvent } from "./session-data";

const RAW_KEPT_DAYS = SESSION_COMPACT_AFTER_MS / (24 * 60 * 60 * 1000);

export function ExportMenu({
	built,
	events,
	source,
	clipCounts,
	fileBase,
}: {
	/** chronological */
	built: readonly BuiltMatch<ScanEvent>[];
	/** null once the session is compacted */
	events: readonly ScanEvent[] | null;
	source: MatchCsvSource;
	clipCounts: readonly number[];
	/** `scanner-matches-2026-09-16` / `sws26-finals` — the download's stem */
	fileBase: string;
}) {
	return (
		<SendouMenu
			trigger={
				<SendouButton
					variant="minimal"
					size="small"
					icon={<Download />}
					isDisabled={built.length === 0 && !events?.length}
				>
					CSV
				</SendouButton>
			}
			placement="bottom end"
		>
			<SendouMenuItem
				icon={<FileText />}
				onAction={() =>
					downloadCsv(
						`${fileBase}-matches.csv`,
						matchesToCsv(
							built.map((b) => b.match),
							source,
							clipCounts,
						),
					)
				}
			>
				Matches
			</SendouMenuItem>
			<SendouMenuItem
				icon={<ListTree />}
				isDisabled={events === null}
				onAction={() => {
					if (!events) return;
					downloadCsv(
						`${fileBase}-events.csv`,
						eventsToCsv(
							events.toSorted((a, b) => a.t - b.t),
							source.originT,
						),
					);
				}}
			>
				{events === null
					? `Raw detections (removed ${RAW_KEPT_DAYS} days after the session)`
					: "Raw detections"}
			</SendouMenuItem>
		</SendouMenu>
	);
}
