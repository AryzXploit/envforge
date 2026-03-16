import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { forge, string, number, boolean, url, email, port, secret, json } from '../index.js';

describe('envforge basic', () => {
  const cleanup: string[] = [];
  
  afterEach(() => {
    for (const key of cleanup) {
      delete process.env[key];
    }
    cleanup.length = 0;
  });
  
  function setEnv(key: string, value: string) {
    process.env[key] = value;
    cleanup.push(key);
  }
  
  it('loads number config', () => {
    setEnv('port', '3000');
    
    const config = forge({
      schema: { port: number() },
      envFiles: []
    });
    
    assert.strictEqual(config.values.port, 3000);
  });
  
  it('loads boolean config', () => {
    setEnv('debug', 'true');
    
    const config = forge({
      schema: { debug: boolean() },
      envFiles: []
    });
    
    assert.strictEqual(config.values.debug, true);
  });
  
  it('uses default values', () => {
    const config = forge({
      schema: { withDefault: string({ default: 'fallback' }) },
      envFiles: []
    });
    
    assert.strictEqual(config.values.withDefault, 'fallback');
  });
  
  it('validates url', () => {
    setEnv('apiUrl', 'https://api.example.com');
    
    const config = forge({
      schema: { apiUrl: url() },
      envFiles: []
    });
    
    assert.strictEqual(config.values.apiUrl, 'https://api.example.com');
  });
  
  it('validates email', () => {
    setEnv('adminEmail', 'admin@example.com');
    
    const config = forge({
      schema: { adminEmail: email() },
      envFiles: []
    });
    
    assert.strictEqual(config.values.adminEmail, 'admin@example.com');
  });
  
  it('validates port', () => {
    setEnv('serverPort', '8080');
    
    const config = forge({
      schema: { serverPort: port() },
      envFiles: []
    });
    
    assert.strictEqual(config.values.serverPort, 8080);
  });
  
  it('parses json', () => {
    setEnv('features', '{"darkMode":true,"beta":false}');
    
    const config = forge({
      schema: { features: json<{darkMode: boolean, beta: boolean}>() },
      envFiles: []
    });
    
    assert.deepStrictEqual(config.values.features, { darkMode: true, beta: false });
  });
  
  it('throws on invalid number', () => {
    setEnv('badNum', 'not-a-number');
    
    assert.throws(() => {
      forge({
        schema: { badNum: number() },
        envFiles: []
      });
    }, /Invalid number/);
  });
  
  it('throws on missing required', () => {
    assert.throws(() => {
      forge({
        schema: { requiredVar: string() },
        envFiles: []
      });
    }, /Missing required env/);
  });
  
  it('makes optional fields work', () => {
    const config = forge({
      schema: { optional: string({ required: false }) },
      envFiles: []
    });
    
    assert.strictEqual(config.values.optional, undefined);
  });
});

describe('envforge secrets', () => {
  const cleanup: string[] = [];
  
  afterEach(() => {
    for (const key of cleanup) {
      delete process.env[key];
    }
    cleanup.length = 0;
  });
  
  function setEnv(key: string, value: string) {
    process.env[key] = value;
    cleanup.push(key);
  }
  
  it('auto-detects secrets', () => {
    setEnv('apiKey', 'super-secret-key');
    
    const config = forge({
      schema: { apiKey: string() },
      envFiles: []
    });
    
    assert.strictEqual(config.isSecret('apiKey'), true);
    assert.strictEqual(config.values.apiKey, 'super-secret-key');
  });
  
  it('masks secrets in toJSON', () => {
    setEnv('dbPassword', 'my-password');
    setEnv('appName', 'myapp');
    
    const config = forge({
      schema: { dbPassword: string(), appName: string() },
      envFiles: []
    });
    
    const json = config.toJSON();
    assert(json.includes('[REDACTED]'));
    assert(json.includes('myapp'));
    assert(!json.includes('my-password'));
  });
  
  it('marks explicit secrets', () => {
    setEnv('myToken', 'token123');
    
    const config = forge({
      schema: { myToken: secret(string()) },
      envFiles: []
    });
    
    assert.strictEqual(config.isSecret('myToken'), true);
  });
});

describe('envforge api', () => {
  const cleanup: string[] = [];
  
  afterEach(() => {
    for (const key of cleanup) {
      delete process.env[key];
    }
    cleanup.length = 0;
  });
  
  function setEnv(key: string, value: string) {
    process.env[key] = value;
    cleanup.push(key);
  }
  
  it('supports get() method', () => {
    setEnv('value', 'test');
    
    const config = forge({
      schema: { value: string() },
      envFiles: []
    });
    
    assert.strictEqual(config.get('value'), 'test');
  });
  
  it('supports has() method', () => {
    setEnv('exists', 'yes');
    
    const config = forge({
      schema: { exists: string(), missing: string({ required: false }) },
      envFiles: []
    });
    
    assert.strictEqual(config.has('exists'), true);
    assert.strictEqual(config.has('missing'), false);
  });
  
  it('supports custom validator', () => {
    setEnv('custom', 'hello');
    
    const config = forge({
      schema: {
        custom: {
          type: 'string' as const,
          validator: (v) => v.toUpperCase()
        }
      },
      envFiles: []
    });
    
    assert.strictEqual(config.values.custom, 'HELLO');
  });
});
