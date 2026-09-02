import { RefreshCcw } from "lucide-react";
import * as React from "react";
import {
	isRouteErrorResponse,
	useLocation,
	useNavigate,
	useRevalidator,
	useRouteError,
} from "react-router";
import { useUser } from "~/features/auth/core/user";
import * as Redirect from "~/modules/redirects/core/Redirect";
import { getSessionId } from "~/utils/session-id";
import {
	ERROR_GIRL_IMAGE_PATH,
	LOG_IN_URL,
	SENDOU_INK_DISCORD_URL,
} from "~/utils/urls";
import { SendouButton } from "./elements/Button";
import { Image } from "./Image";
import { Main } from "./Main";

export function Catcher() {
	const error = useRouteError();
	const user = useUser();
	const { revalidate } = useRevalidator();
	const location = useLocation();

	React.useEffect(() => {
		window.scrollTo(0, 0);
	}, []);

	// refresh user data so e.g. a removed cookie shows the prompt to log back in
	const hasRevalidated = React.useRef(false);
	React.useEffect(() => {
		if (!isRouteErrorResponse(error) || error.status !== 401) return;
		if (hasRevalidated.current) return;

		hasRevalidated.current = true;
		revalidate();
	}, [revalidate, error]);

	const isNetworkError =
		error instanceof Error &&
		(error.message.includes("Failed to fetch") ||
			error.message.includes("NetworkError") ||
			error.message.includes("Load failed"));

	if (isNetworkError) {
		return (
			<ErrorMain>
				<ErrorGirlImage />
				<h2 className="text-center">Connection error</h2>
				<p className="text-center">
					The server was temporarily unavailable. This is usually a brief
					network issue.
				</p>
				<div className="mt-4 stack sm items-center">
					<RefreshPageButton />
				</div>
			</ErrorMain>
		);
	}

	if (!isRouteErrorResponse(error)) {
		const sessionId = getSessionId();
		const errorText = (() => {
			if (!(error instanceof Error)) return;

			return `Session ID: ${sessionId}\nTime: ${new Date().toISOString()}\nURL: ${location.pathname}${location.search}\nUser ID: ${user?.id ?? "Not logged in"}\n${error.stack ?? error.message}`;
		})();

		return (
			<ErrorMain>
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
			</ErrorMain>
		);
	}

	switch (error.status) {
		case 401:
			if (!user) {
				return (
					<ErrorMain>
						<h2>Authentication required</h2>
						<p>This page requires you to be logged in.</p>
						<form action={LOG_IN_URL} method="post" className="mt-2">
							<SendouButton type="submit" variant="minimal">
								Log in via Discord
							</SendouButton>
						</form>
					</ErrorMain>
				);
			}
			return (
				<ErrorMain>
					<h2>Error 401 Unauthorized</h2>
					<GetHelp />
				</ErrorMain>
			);
		case 403:
			return (
				<ErrorMain>
					<h2>Error 403 Forbidden</h2>
					<p className="text-sm text-lighter font-semi-bold">
						Your account doesn't have the required permissions to perform this
						action.
					</p>
					<GetHelp />
				</ErrorMain>
			);
		case 404:
			return <PageNotFound />;
		default:
			return (
				<ErrorMain>
					<h2>Error {error.status}</h2>
					<GetHelp />
					<div className="text-sm text-lighter font-semi-bold">
						Please include the session ID and message below if any and an
						explanation on what you were doing:
					</div>
					<pre>
						Session ID: {getSessionId()}
						{error.data
							? `\n${typeof error.data === "string" ? error.data : JSON.stringify(error.data, null, 2)}`
							: null}
					</pre>
				</ErrorMain>
			);
	}
}

/** Client side navigation to an unmatched URL never reaches the server, so `redirectsMiddleware`'s redirects are checked here too. */
function PageNotFound() {
	const location = useLocation();
	const navigate = useNavigate();
	const redirectTo = Redirect.resolve(location);

	React.useEffect(() => {
		if (redirectTo) {
			navigate(redirectTo, { replace: true });
		}
	}, [redirectTo, navigate]);

	if (redirectTo) return null;

	return (
		<ErrorMain>
			<h2>Error 404 - Page not found</h2>
			<GetHelp />
		</ErrorMain>
	);
}

/** Every branch of the error page, marked so tests can assert one is not shown. */
function ErrorMain({ children }: { children: React.ReactNode }) {
	return <Main testId="error-page">{children}</Main>;
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
			icon={<RefreshCcw />}
		>
			Refresh page
		</SendouButton>
	);
}
