export type Snapshot = {
  sessions: { id: string; title: string; messageCount: number }[]
  note: string
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch('/api/snapshot')
  if (!res.ok) throw new Error(`snapshot ${res.status}`)
  return res.json() as Promise<Snapshot>
}
