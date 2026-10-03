export type Snapshot = {
  sessions: { id: string; title: string; messageCount: number }[]
  note: string
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch('/api/snapshot')
  if (!res.ok) throw new Error(`snapshot ${res.status}`)
  const j = await res.json(); if (!j || !Array.isArray((j as {sessions?: unknown}).sessions)) throw new Error('snapshot bad-shape'); return j as Snapshot
}
