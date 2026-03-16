import { forge, string, number, boolean, url, secret, port } from 'envforge';

const config = forge({
  schema: {
    nodeEnv: string({ default: 'development' }),
    port: port({ default: 3000 }),
    dbHost: string({ default: 'localhost' }),
    dbPort: port({ default: 5432 }),
    apiKey: secret(string()),
    databaseUrl: url(),
    debug: boolean({ default: false })
  }
});

console.log('Server config:', config.toJSON());
console.log('API Key (access):', config.get('apiKey'));
console.log('Is apiKey secret?', config.isSecret('apiKey'));
