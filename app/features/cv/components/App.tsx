import { useEffect, useState } from "react";
import { useUser } from "~/features/auth/core/user";
import { LivePage } from "./LivePage";
import { ScreenshotPage } from "./ScreenshotPage";
import type { SendouUser } from "./sendou-ingest";
import { VodPage } from "./VodPage";
import "./styles.css";

function useHashRoute(): string {
	const [hash, setHash] = useState(() => window.location.hash);
	useEffect(() => {
		const onChange = () => setHash(window.location.hash);
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	}, []);
	return hash;
}

/** The sendou.ink login, from the root loader's user context. */
function SendouLogin({ user }: { user: SendouUser | null }) {
	return (
		<div className="topbar-user">
			{user ? (
				<span className="topbar-username" title="Logged in on sendou.ink">
					{user.username}
				</span>
			) : (
				<a href="/auth/login">Log in</a>
			)}
		</div>
	);
}

export function App() {
	const route = useHashRoute();
	const rootUser = useUser();
	const sendouUser: SendouUser | null = rootUser
		? { id: rootUser.id, username: rootUser.username }
		: null;

	const page = route.startsWith("#/screenshot") ? (
		<ScreenshotPage />
	) : route.startsWith("#/vod") ? (
		<VodPage sendouUser={sendouUser} />
	) : (
		<LivePage sendouUser={sendouUser} />
	);
	const active = route.startsWith("#/screenshot")
		? "screenshot"
		: route.startsWith("#/vod")
			? "vod"
			: "live";
	return (
		<div className="cv-app">
			<div className="app">
				<header className="topbar">
					<div className="site-title">
						<h1>CV</h1>
					</div>
					<nav>
						<a href="#/" className={active === "live" ? "active" : ""}>
							Live
						</a>
						<a
							href="#/screenshot"
							className={active === "screenshot" ? "active" : ""}
						>
							Screenshot
						</a>
						<a href="#/vod" className={active === "vod" ? "active" : ""}>
							VoD
						</a>
					</nav>
					<SendouLogin user={sendouUser} />
				</header>
				{page}
			</div>
		</div>
	);
}
