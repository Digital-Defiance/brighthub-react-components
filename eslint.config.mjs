import nx from '@nx/eslint-plugin';
import baseConfig from '../eslint.config.mjs';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    name: 'brighthub-react-components/react',
    files: ['**/*.tsx', '**/*.jsx'],
    ...nx.configs['flat/react'].find((c) => c.name === 'nx/react'),
  },
  {
    name: 'brighthub-react-components/browser-globals',
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
