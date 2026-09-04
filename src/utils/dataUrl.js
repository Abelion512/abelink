// Hilangkan prefix data URL ("data:image/png;base64,") sebelum base64 dikirim
// ke Rust untuk didekode. misc_take_screenshot mengembalikan data URL penuh —
// tanpa strip ini decode di sisi Rust selalu gagal (bug runtime yang tidak
// tertangkap cargo check). Input sudah base64 murni lolos tanpa diubah.
export const stripDataUrlPrefix = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed.startsWith('data:')) {
    const idx = trimmed.indexOf('base64,')
    return idx === -1 ? '' : trimmed.slice(idx + 'base64,'.length).trim()
  }
  return trimmed
}
