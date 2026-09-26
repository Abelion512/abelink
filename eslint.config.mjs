import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Audit 2026-09: config lama mengimpor @electron-toolkit/eslint-config dan
// @electron-toolkit/eslint-config-prettier, tetapi keduanya TIDAK ada di
// package.json, sehingga `bun run lint` selalu crash (ERR_MODULE_NOT_FOUND).
// Config ini sekarang self-contained: hanya memakai plugin yang memang
// terpasang di devDependencies. Layer prettier-compat dihapus bersama paket
// yang hilang (rules formatting sudah deprecated di ESLint 9, jadi dampaknya
// praktis nol); rules inti proyek tetap didefinisikan eksplisit di bawah.
// ESLint tidak membaca .gitignore, jadi direktori build WAJIB didaftarkan di
// sini. Audit 2026-09-12: `src-tauri/target/` (salinan sidecar + extension hasil
// `tauri build`) ikut ter-lint dan menyumbang 121 dari 972 warning, sehingga
// angka baseline tech-debt jadi bias dan lint lambat.
export default [
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/dist-sidecar',
      '**/out',
      '**/target',
      '**/coverage',
      '**/graphify-out',
      // Clone referensi sst/opencode untuk riset pola TUI: bukan bagian repo
      // (lihat .gitignore `/opencode/`) dan punya node_modules sendiri. ESLint
      // tidak membaca .gitignore, jadi wajib dikecualikan eksplisit di sini.
      '**/opencode',
      // Scratch lokal tool agen + state runtime. Semua ini sudah ada di
      // .gitignore, tapi ESLint tak membacanya. Sebelum blok TS ada, isinya
      // (.ts) kebetulan luput karena `files` hanya js/jsx; begitu .ts di-lint,
      // file scratch seperti .remember/tmp/*.ts langsung jadi error gate.
      '**/.worktrees',
      '**/worktrees',
      '**/.hermes',
      '**/.zcode',
      '**/.impeccable',
      '**/.remember',
      '**/.superpowers',
      '**/.gemini',
      '**/.antigravity',
      '**/.cursor',
      '**/.windsurf',
      '**/.copilot',
      '**/.agent',
      '**/.subagents',
      '**/brain',
      '**/scratch',
      '**/agent-transcripts',
      '**/harness-logs',
      '**/.abelink'
    ]
  },
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // ponytail: tech-debt rules downgraded to warn (hundreds of pre-existing
      // hits repo-wide). Fix incrementally, then re-enable as error.
      // 2026-09-23: intent-level resolutions (verified by audit, not debt):
      // - react/prop-types OFF: zero .propTypes adoption in src//extension/,
      //   `prop-types` dep not installed, React 19 idiom is no runtime types.
      // - only-export-components OFF: dev-only fast-refresh nicety; repo
      //   convention co-locates helpers/hooks with components (contexts/).
      // - no-unused-vars ignores ^_: `_` bindings are deliberate "unused".
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'react/prop-types': 'off',
      'react/display-name': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      // Electron <webview> attrs (useragent/allowpopups) unknown to react plugin
      'react/no-unknown-property': 'warn',
      // legacy effect patterns; fixing = refactor, tracked as debt.
      // 2026-09-24: verified the rule also fires on React's own sanctioned
      // patterns (useEffectEvent call sites, subscription cleanups), so these
      // stay warn — "fixing" them adds indirection without behavior change.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn'
    }
  },
  // TypeScript: sebelum 2026-09-26 `.ts/.tsx` sama sekali tidak di-lint
  // (`files` hanya js/jsx), jadi 3 file .tsx yang ada berjalan tanpa jaring.
  // Config `typescript-eslint` discope ke keluarga .ts saja agar parser TS
  // tidak menggantikan espree untuk .js/.mjs (baseline warning lama stabil).
  // 2026-09-26: `typescript` dipin ke 5.9.x — typescript-eslint 8.x belum
  // mendukung TS 7 (compiler Go) dan menolak jalan sama sekali.
  ...tseslint.configs.recommended.map((cfg) =>
    cfg.files ? cfg : { ...cfg, files: ['**/*.{ts,tsx,mts,cts}'] }
  ),
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // Samakan filosofi dengan blok JS di atas: temuan warisan diturunkan ke
      // warn agar lint tetap exit 0 sambil migrasi, bukan disembunyikan.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/ban-ts-comment': 'warn',
      // Base rule mati untuk TS (digantikan versi bertipe di atas).
      'no-unused-vars': 'off',
      // eslint-plugin-react diasumsikan DOM. Komponen TUI (OpenTUI/Solid di
      // cli/**, bin/**.tsx) memakai intrinsics terminal (fg, focused,
      // placeholderColor, keyBindings, ...) dan tidak memakai runtime
      // prop-types — sama seperti keputusan `react/prop-types: 'off'` di blok
      // JS. Tanpa ini blok TS meledak 108 error palsu.
      'react/prop-types': 'off',
      'react/display-name': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/no-unknown-property': 'warn'
    }
  }
]
