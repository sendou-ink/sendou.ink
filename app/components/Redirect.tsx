import * as React from "react";
import { useNavigate } from "react-router";

export function Redirect({ to }: { to: string }) {
	const navigate = useNavigate();

	React.useEffect(() => {
		void navigate(to);
	}, [navigate, to]);

	return null;
}
