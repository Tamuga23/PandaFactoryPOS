import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  firebaseRulesPlugin.configs['flat/recommended'],
  {
    files: ["*.rules"],
    plugins: {
      "@firebase/security-rules": firebaseRulesPlugin
    }
  }
];
