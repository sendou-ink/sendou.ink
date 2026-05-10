import { LOG_IN_URL } from "~/utils/urls";

export function LogInButtonContainer({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<form action={LOG_IN_URL} method="post" className="stack items-center">
			{children}
		</form>
	);
}
