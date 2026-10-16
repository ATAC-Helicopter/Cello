export default [{
    files: ['extension/**/*.js', 'tests/bluez-events.js'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'module',
        globals: {global: 'readonly', console: 'readonly', TextDecoder: 'readonly', print: 'readonly'}},
    rules: {
        'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'}],
        'no-undef': 'error',
        'no-unreachable': 'error',
        'no-constant-condition': 'error',
        'no-dupe-keys': 'error',
        'eqeqeq': 'error',
    },
}];
