// Test schema file for CLI
export default {
  dbHost: { type: 'string', default: 'localhost' },
  dbPort: { type: 'port', default: 5432 },
  apiKey: { type: 'string', secret: true },
  debug: { type: 'boolean', default: false },
  apiUrl: { type: 'url', required: true }
};
