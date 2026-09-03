// Bounded-concurrency pool util (dipakai hydrateFromDexie & pekerjaan async massal).
// Menjalankan worker generik dengan maksimal `concurrency` eksekusi bersamaan,
// mempertahankan urutan hasil == urutan input, dan tidak pernah melempar:
// slot yang gagal menghasilkan Error di posisinya (Promise.allSettled semantics).
// Regresi dulu: regenerasi embedding 100% serial — startup lama di korpus besar.
export const asyncPool = async (concurrency, items, worker) => {
  const list = Array.isArray(items) ? items : []
  const limit = Math.max(1, Number(concurrency) || 1)
  const results = new Array(list.length)
  let next = 0

  const runNext = async () => {
    while (next < list.length) {
      const index = next++
      try {
        results[index] = await worker(list[index], index)
      } catch (err) {
        results[index] = err instanceof Error ? err : new Error(String(err))
      }
    }
  }

  const runners = []
  for (let i = 0; i < Math.min(limit, list.length); i++) runners.push(runNext())
  await Promise.all(runners)
  return results
}
