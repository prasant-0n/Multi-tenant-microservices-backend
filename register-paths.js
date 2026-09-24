const path = require('path');
const tsconfigPaths = require('tsconfig-paths');

tsconfigPaths.register({
  baseUrl: path.resolve(__dirname, 'dist'),
  paths: {
    '@app/tenancy': ['libs/tenancy'],
    '@app/tenancy/*': ['libs/tenancy/*'],
  },
});