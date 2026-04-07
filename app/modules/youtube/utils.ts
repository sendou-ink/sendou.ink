import invariant from "~/utils/invariant";

export const hasYouTubeEnvVars = () => Boolean(process.env.YOUTUBE_API_KEY);

export const getYouTubeEnvVars = () => {
	const { YOUTUBE_API_KEY } = process.env;

	invariant(
		YOUTUBE_API_KEY,
		"Missing YOUTUBE_API_KEY env var, showing no streams",
	);

	return { YOUTUBE_API_KEY };
};

export const youtubeVideoUrl = (videoId: string) =>
	`https://youtube.com/watch?v=${videoId}`;
