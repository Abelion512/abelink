import bg from './assets/bg-night-city.jpg'
import type { Snapshot } from './api'

export function Home({ snapshot }: { snapshot: Snapshot | null }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        margin: 0,
        background: `#000 url(${bg}) center/cover no-repeat`,
        color: '#fff',
        fontFamily: 'Georgia, "Times New Roman", serif',
        display: 'grid',
        gridTemplateColumns: '1fr 1.4fr 1fr',
        gap: 0,
      }}
    >
      <section aria-label="sesi">
        <h2>Sesi</h2>
        {snapshot ? (
          snapshot.sessions.map((s) => <p key={s.id}>{s.title}</p>)
        ) : (
          <p>belum tersambung</p>
        )}
      </section>
      <section aria-label="utama">
        <h1>Abelink Web</h1>
        <p>{snapshot ? snapshot.note : 'belum tersambung'}</p>
      </section>
      <section aria-label="status">
        <h2>Status</h2>
        <p>belum tersambung</p>
      </section>
    </main>
  )
}
