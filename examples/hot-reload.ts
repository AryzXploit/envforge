import { forge, string, number } from 'envforge';

const config = forge({
  schema: {
    dbHost: string({ default: 'localhost' }),
    dbPort: number({ default: 5432 }),
    apiUrl: string()
  },
  watch: true,
  onReload: (values) => {
    console.log('Config reloaded!', values);
    // Restart connections, update caches, etc.
  },
  onError: (err) => {
    console.error('Failed to reload config:', err.message);
  }
});

// Now when .env changes, config auto-updates
console.log('Initial config:', config.values);

// Cleanup when shutting down
process.on('SIGINT', () => {
  config.destroy();
  process.exit(0);
});
