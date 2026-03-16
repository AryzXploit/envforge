import { forge, string, number, secret } from 'envforge';

const config = forge({
  schema: {
    apiKey: secret(string()),
    dbPassword: secret(string()),
    appName: string({ default: 'myapp' }),
    logLevel: string({ default: 'info' })
  }
});

// Secrets auto-redacted in logs
console.log('Config for logging:', config.toJSON());
// Output: { "apiKey": "[REDACTED]", "dbPassword": "[REDACTED]", "appName": "myapp", ... }

// But you can still access the real value when needed
if (config.isSecret('apiKey')) {
  console.log('Key is secret, using safely...');
}

// Mask secrets in any object
const logPayload = config.maskSecrets({
  user: 'john',
  apiKey: config.get('apiKey'),
  action: 'login'
});
console.log('Audit log:', logPayload);
