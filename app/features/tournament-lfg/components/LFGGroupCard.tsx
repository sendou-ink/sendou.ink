// Phase 5: Implement group card component here, or delete this and reuse GroupCard?
// See app/features/sendouq/components/GroupCard.tsx for pattern reference

export function LFGGroupCard({ group }: { group: any }) {
	return (
		<div>
			<span>Group {group.id}</span>
			<span>{group.members.length} members</span>
		</div>
	);
}
