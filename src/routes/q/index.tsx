import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/q/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/q/"!</div>
}
