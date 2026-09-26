import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

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
      '**/graphify-out'
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
  }
]
