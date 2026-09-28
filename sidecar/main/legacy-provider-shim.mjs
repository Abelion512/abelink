// legacy-provider-shim.mjs — jembatan impor modul murni renderer untuk sisi
// sidecar (pola semver-lite.mjs). Semua fungsi diteruskan apa adanya.
export {
  canonicalizeEndpointUrl,
  resolveEndpointUrl,
  resolveChatEndpoint,
  presetEndpoint,
  getPreset,
  listPresets,
  suggestProtocol,
  detectFromUrl,
  normalizeLegacyProviderConfig,
  LEGACY_HOSTS,
} from '../../src/api/ai/providerRegistry.js'
