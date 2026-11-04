/**
 * A scanned file's clip criteria under its header: changing them re-cuts the
 * clips off the saved scan (vod-clip-cutter.ts), no rescan. A scan from an
 * earlier visit kept no clips, so it asks for its file to cut them.
 */
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import type { ClipCriteria } from "../core/clips/criteria";
import { ClipCriteriaFields } from "./ClipCriteriaFields";
import type { ScanEvent } from "./session-data";
import styles from "./VodClipsPanel.module.css";
import {
	cutVodClips,
	MAX_VOD_CLIPS,
	updateVodClipCriteria,
	useVodClipCriteria,
	useVodClipsWork,
	type VodClipsWork,
} from "./vod-clip-cutter";
import {
	rememberVisitVodFile,
	VOD_FILE_ACCEPT,
	visitVodFile,
} from "./vod-scan";

export function VodClipsPanel({
	name,
	events,
}: {
	name: string;
	events: readonly ScanEvent[];
}) {
	const criteria = useVodClipCriteria();
	const work = useVodClipsWork(name);
	const [file, setFile] = useState(() => visitVodFile(name));

	const changeCriteria = (patch: Partial<ClipCriteria>) => {
		updateVodClipCriteria(patch);
		if (file) void cutVodClips({ name, file, events });
	};

	return (
		<section className={styles.panel} aria-label="Clip criteria">
			<ClipCriteriaFields
				idPrefix="vod-clips"
				criteria={criteria}
				onChange={changeCriteria}
			/>
			{!file ? (
				<div className={styles.status}>
					<span>
						Open the file again to cut its clips: only its scan was saved.
					</span>
					<label className={styles.fileButton}>
						<FolderOpen size={14} />
						Open file
						<input
							type="file"
							accept={VOD_FILE_ACCEPT}
							onChange={(e) => {
								const picked = e.target.files?.[0];
								e.target.value = "";
								if (!picked) return;
								rememberVisitVodFile(picked);
								setFile(picked);
								void cutVodClips({ name, file: picked, events });
							}}
						/>
					</label>
				</div>
			) : work ? (
				<div className={styles.status}>
					<WorkStatus work={work} />
				</div>
			) : null}
		</section>
	);
}

function WorkStatus({ work }: { work: VodClipsWork }) {
	if (work.state === "cutting") {
		return work.total > 0
			? `Saving clip ${Math.min(work.done + 1, work.total)}/${work.total}…`
			: null;
	}
	if (work.error) {
		return <span className={styles.error}>Clips: {work.error}</span>;
	}
	if (work.qualifying === 0) return "No streaks meet these criteria.";
	if (work.qualifying > MAX_VOD_CLIPS) {
		return `The best ${MAX_VOD_CLIPS} of ${work.qualifying} streaks are clipped.`;
	}
	return null;
}
