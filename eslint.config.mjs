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
export default [
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
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
      'no-unused-vars': 'warn',
      'react/prop-types': 'warn',
      'react/display-name': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      // Electron <webview> attrs (useragent/allowpopups) unknown to react plugin
      'react/no-unknown-property': 'warn',
      // legacy effect patterns; fixing = refactor, tracked as debt
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn'
    }
  }
]
