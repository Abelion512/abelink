import eslint from '@electron-toolkit/eslint-config'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  eslint,
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
  },
  eslintConfigPrettier
]
