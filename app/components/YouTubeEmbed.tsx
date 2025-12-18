import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toastQueue } from "./elements/Toast";

export function YouTubeEmbed({
	id,
	start,
	autoplay = false,
	enableApi = false,
	onPlayerReady,
}: {
	id: string;
	start?: number;
	autoplay?: boolean;
	enableApi?: boolean;
	onPlayerReady?: (player: YT.Player) => void;
}) {
	const { t } = useTranslation(["vods"]);
	const playerRef = useRef<YT.Player | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isApiReady, setIsApiReady] = useState(false);
	const [hasError, setHasError] = useState(false);

	useEffect(() => {
		if (!enableApi || typeof window === "undefined") return;

		if (window.YT?.Player) {
			setIsApiReady(true);
			return;
		}

		const tag = document.createElement("script");
		tag.src = "https://www.youtube.com/iframe_api";
		const firstScriptTag = document.getElementsByTagName("script")[0];

		tag.onerror = () => {
			toastQueue.add({
				message: t("vods:errors.youtubePreviewFailed"),
				variant: "error",
			});
			setHasError(true);
		};

		firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

		window.onYouTubeIframeAPIReady = () => {
			setIsApiReady(true);
		};

		const timeout = setTimeout(() => {
			if (!window.YT?.Player) {
				toastQueue.add({
					message: t("vods:errors.youtubePreviewFailed"),
					variant: "error",
				});
				setHasError(true);
			}
		}, 10000);

		return () => clearTimeout(timeout);
	}, [enableApi, t]);

	useEffect(() => {
		if (!enableApi || !isApiReady || !containerRef.current) return;

		if (playerRef.current) {
			try {
				playerRef.current.loadVideoById({ videoId: id, startSeconds: start });
			} catch {
				toastQueue.add({
					message: t("vods:errors.youtubePreviewFailed"),
					variant: "error",
				});
				setHasError(true);
			}
			return;
		}

		try {
			const player = new window.YT.Player(containerRef.current, {
				height: "281",
				width: "500",
				videoId: id,
				playerVars: {
					autoplay: autoplay ? 1 : 0,
					controls: 1,
					rel: 0,
					modestbranding: 1,
					start: start ?? 0,
				},
				events: {
					onReady: () => {
						playerRef.current = player;
						onPlayerReady?.(player);
					},
					onError: () => {
						toastQueue.add({
							message: t("vods:errors.youtubePreviewFailed"),
							variant: "error",
						});
						setHasError(true);
					},
				},
			});
		} catch {
			toastQueue.add({
				message: t("vods:errors.youtubePreviewFailed"),
				variant: "error",
			});
			setHasError(true);
		}
	}, [enableApi, isApiReady, id, start, autoplay, onPlayerReady, t]);

	if (enableApi) {
		if (hasError) {
			return null;
		}

		return (
			<div className="youtube__container--api">
				<div ref={containerRef} />
			</div>
		);
	}

	return (
		<div className="youtube__container">
			<iframe
				className="youtube__iframe"
				src={`https://www.youtube.com/embed/${id}?autoplay=${
					autoplay ? "1" : "0"
				}&controls=1&rel=0&modestbranding=1&start=${start ?? 0}`}
				frameBorder="0"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowFullScreen
				title="Embedded youtube"
			/>
		</div>
	);
}
