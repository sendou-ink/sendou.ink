import * as React from "react";
import {
	isRouteErrorResponse,
	useRevalidator,
	useRouteError,
} from "react-router";
import { useLocation } from "react-use";
import { useUser } from "~/features/auth/core/user";
import { getSessionId } from "~/utils/session-id";
import {
	ERROR_GIRL_IMAGE_PATH,
	LOG_IN_URL,
	SENDOU_INK_DISCORD_URL,
} from "~/utils/urls";
import { SendouButton } from "./elements/Button";
import { Image } from "./Image";
import { RefreshArrowsIcon } from "./icons/RefreshArrows";
import { Main } from "./Main";

export function Catcher() {
	const error = useRouteError();
	const user = useUser();
	const { revalidate } = useRevalidator();
	const location = useLocation();

	// refresh user data to make sure it's up to date (e.g. cookie might have been removed, let's show the prompt to log back in)
	React.useEffect(() => {
		if (!isRouteErrorResponse(error) || error.status !== 401) return;

		revalidate();
	}, [revalidate, error]);

	const isNetworkError =
		error instanceof Error &&
		(error.message.includes("Failed to fetch") ||
			error.message.includes("NetworkError") ||
			error.message.includes("Load failed"));

	if (isNetworkError) {
		return (
			<Main>
				<ErrorGirlImage />
				<h2 className="text-center">Connection error</h2>
				<p className="text-center">
					The server was temporarily unavailable. This is usually a brief
					network issue.
				</p>
				<div className="mt-4 stack sm items-center">
					<RefreshPageButton />
				</div>
			</Main>
		);
	}

	if (!isRouteErrorResponse(error)) {
		const sessionId = getSessionId();
		const errorText = (() => {
			if (!(error instanceof Error)) return;

			return `Session ID: ${sessionId}\nTime: ${new Date().toISOString()}\nURL: ${location.href}\nUser ID: ${user?.id ?? "Not logged in"}\n${error.stack ?? error.message}`;
		})();

		return (
			<Main>
				<ErrorGirlImage />
				<h2 className="text-center">Error happened</h2>
				<p className="text-center">
					There was an unexpected error. If this keeps happening, please report
					it on <a href={SENDOU_INK_DISCORD_URL}>our Discord</a> so it can be
					fixed. Include the error message below.
				</p>
				{errorText ? (
					<div className="mt-4 stack sm items-center">
						<textarea readOnly defaultValue={errorText} />
						<div className="mt-2">
							<RefreshPageButton />
						</div>
					</div>
				) : null}
			</Main>
		);
	}

	switch (error.status) {
		case 401:
			if (!user) {
				return (
					<Main>
						<h2>Authentication required</h2>
						<p>This page requires you to be logged in.</p>
						<form action={LOG_IN_URL} method="post" className="mt-2">
							<SendouButton type="submit" variant="minimal">
								Log in via Discord
							</SendouButton>
						</form>
					</Main>
				);
			}
			return (
				<Main>
					<h2>Error 401 Unauthorized</h2>
					<GetHelp />
				</Main>
			);
		case 403:
			return (
				<Main>
					<h2>Error 403 Forbidden</h2>
					<p className="text-sm text-lighter font-semi-bold">
						Your account doesn't have the required permissions to perform this
						action.
					</p>
					<GetHelp />
				</Main>
			);
		case 404:
			return (
				<Main>
					<h2>Error {error.status} - Page not found</h2>
					<GetHelp />
				</Main>
			);
		default:
			return (
				<Main>
					<h2>Error {error.status}</h2>
					<GetHelp />
					<div className="text-sm text-lighter font-semi-bold">
						Please include the session ID and message below if any and an
						explanation on what you were doing:
					</div>
					<pre>
						Session ID: {getSessionId()}
						{error.data
							? `\n${JSON.stringify(JSON.parse(error.data), null, 2)}`
							: null}
					</pre>
				</Main>
			);
	}
}

function GetHelp() {
	return (
		<p className="mt-2">
			If you need assistance you can ask for help on{" "}
			<a href={SENDOU_INK_DISCORD_URL}>our Discord</a>
		</p>
	);
}

function ErrorGirlImage() {
	return (
		<Image
			className="m-0-auto"
			path={ERROR_GIRL_IMAGE_PATH}
			width={292}
			height={243.5}
			alt=""
		/>
	);
}

function RefreshPageButton() {
	return (
		<SendouButton
			onPress={() => window.location.reload()}
			icon={<RefreshArrowsIcon />}
		>
			Refresh page
		</SendouButton>
	);
}
