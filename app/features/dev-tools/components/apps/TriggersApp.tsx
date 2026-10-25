import { Bell, Zap } from "lucide-react";
import * as React from "react";
import { useFetcher, useLocation } from "react-router";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouSection } from "~/components/elements/Section";
import { toastQueue } from "~/components/elements/Toast";
import { useUser } from "~/features/auth/core/user";
import { postDev } from "../../core/dev-api";
import type { DEV_ERROR_KINDS } from "../../dev-tools-constants";
import type { DevApp } from "../../dev-tools-types";
import { DEV_NOTIFICATIONS_URL, devErrorUrl } from "../../dev-tools-urls";
import type { DevNotificationsLoaderData } from "../../routes/dev.notifications";

export const triggersDevApp: DevApp = {
	id: "triggers",
	title: "Triggers",
	description: "Toasts, error pages and notifications on demand",
	icon: <Zap />,
	size: "md",
	Component: TriggersApp,
};

const ERROR_PAGES: Array<{
	kind: (typeof DEV_ERROR_KINDS)[number];
	label: string;
}> = [
	{ kind: "404", label: "404 Not found" },
	{ kind: "401", label: "401 Unauthorized" },
	{ kind: "403", label: "403 Forbidden" },
	{ kind: "500", label: "500 Loader threw" },
	{ kind: "render", label: "Render crashed" },
];

function TriggersApp() {
	return (
		<div className="stack md">
			<ToastsSection />
			<ErrorPagesSection />
			<NotificationsSection />
		</div>
	);
}

function ToastsSection() {
	const location = useLocation();

	// the redirect toast params belong to no search params definition, root.tsx reads them by hand too
	const redirectToastHref = () => {
		const search = new URLSearchParams(location.search);
		search.set("__success", "Toast set by a server redirect");
		return `${location.pathname}?${search}`;
	};

	return (
		<SendouSection title="Toasts">
			<p className="text-xs text-lighter">
				The client queue directly, or the way an action's redirect asks for one
			</p>
			<div className="stack horizontal sm flex-wrap">
				<SendouButton
					variant="outlined-success"
					size="small"
					onClick={() =>
						toastQueue.add(
							{ message: "Saved, looking good", variant: "success" },
							{ timeout: 5000 },
						)
					}
				>
					Success
				</SendouButton>
				<SendouButton
					variant="outlined-destructive"
					size="small"
					onClick={() =>
						toastQueue.add({
							message: "Something went wrong while saving",
							variant: "error",
						})
					}
				>
					Error
				</SendouButton>
				<SendouButton
					variant="outlined"
					size="small"
					onClick={() =>
						toastQueue.add(
							{ message: "Heads up, this is information", variant: "info" },
							{ timeout: 5000 },
						)
					}
				>
					Info
				</SendouButton>
				<LinkButton to={redirectToastHref()} variant="outlined" size="small">
					Via redirect params
				</LinkButton>
			</div>
		</SendouSection>
	);
}

function ErrorPagesSection() {
	return (
		<SendouSection title="Error pages">
			<p className="text-xs text-lighter">
				Opens a page whose loader throws, or whose component throws while
				rendering
			</p>
			<div className="stack horizontal sm flex-wrap">
				{ERROR_PAGES.map((errorPage) => (
					<LinkButton
						key={errorPage.kind}
						to={devErrorUrl(errorPage.kind)}
						variant="outlined"
						size="small"
					>
						{errorPage.label}
					</LinkButton>
				))}
			</div>
		</SendouSection>
	);
}

function NotificationsSection() {
	const user = useUser();
	const { load, data } = useFetcher<DevNotificationsLoaderData>();
	const [type, setType] = React.useState("SQ_NEW_MATCH");
	const [pending, setPending] = React.useState<"one" | "all" | null>(null);
	const [result, setResult] = React.useState<string | null>(null);

	React.useEffect(() => {
		load(DEV_NOTIFICATIONS_URL);
	}, [load]);

	const send = async (sentType: string, which: "one" | "all") => {
		setPending(which);
		const response = await postDev<{ sentCount: number }>(
			DEV_NOTIFICATIONS_URL,
			{ type: sentType },
		);
		setPending(null);
		setResult(
			response.ok
				? `Sent ${response.data.sentCount}, check the bell`
				: response.error,
		);
	};

	return (
		<SendouSection title="Notifications">
			<p className="text-xs text-lighter">
				Sample data of each type to you, in-app only. Never a web push.
			</p>
			{user ? (
				<div className="stack horizontal sm flex-wrap items-center">
					<select
						className="w-max"
						value={type}
						onChange={(event) => setType(event.target.value)}
						aria-label="Notification type"
					>
						{data?.types.map((notificationType) => (
							<option key={notificationType} value={notificationType}>
								{notificationType}
							</option>
						))}
					</select>
					<SendouButton
						size="small"
						icon={<Bell />}
						isPending={pending === "one"}
						onClick={() => send(type, "one")}
					>
						Send to me
					</SendouButton>
					<SendouButton
						variant="outlined"
						size="small"
						isPending={pending === "all"}
						onClick={() => send("ALL", "all")}
					>
						Send every type
					</SendouButton>
					{result ? (
						<span className="text-xs text-lighter">{result}</span>
					) : null}
				</div>
			) : (
				<p className="text-xs text-lighter">
					Log in first, notifications go to you
				</p>
			)}
		</SendouSection>
	);
}
