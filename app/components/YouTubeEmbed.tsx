import { useEffect, useRef, useState } from "react";

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
	const playerRef = useRef<YT.Player | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isApiReady, setIsApiReady] = useState(false);

	useEffect(() => {
		if (!enableApi || typeof window === "undefined") return;

		if (window.YT?.Player) {
			setIsApiReady(true);
			return;
		}

		const tag = document.createElement("script");
		tag.src = "https://www.youtube.com/iframe_api";
		const firstScriptTag = document.getElementsByTagName("script")[0];
		firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

		window.onYouTubeIframeAPIReady = () => {
			setIsApiReady(true);
		};
	}, [enableApi]);

	useEffect(() => {
		if (!enableApi || !isApiReady || !containerRef.current) return;

		if (playerRef.current) {
			playerRef.current.loadVideoById({ videoId: id, startSeconds: start });
			return;
		}

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
			},
		});
	}, [enableApi, isApiReady, id, start, autoplay, onPlayerReady]);

	if (enableApi) {
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
