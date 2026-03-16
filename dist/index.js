import { readFileSync, existsSync, watch } from 'fs';
import { resolve } from 'path';
const BUILTIN_VALIDATORS = {
    string: (v) => v,
    number: (v) => {
        const n = Number(v);
        if (isNaN(n))
            throw new Error(`Invalid number: ${v}`);
        return n;
    },
    boolean: (v) => {
        const lower = v.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes')
            return true;
        if (lower === 'false' || lower === '0' || lower === 'no')
            return false;
        throw new Error(`Invalid boolean: ${v}`);
    },
    url: (v) => {
        try {
            new URL(v);
            return v;
        }
        catch {
            throw new Error(`Invalid URL: ${v}`);
        }
    },
    email: (v) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(v))
            throw new Error(`Invalid email: ${v}`);
        return v;
    },
    json: (v) => {
        try {
            return JSON.parse(v);
        }
        catch {
            throw new Error(`Invalid JSON: ${v}`);
        }
    },
    port: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 1 || n > 65535) {
            throw new Error(`Invalid port: ${v} (must be 1-65535)`);
        }
        return n;
    }
};
const SECRET_PATTERNS = [
    /key/i, /secret/i, /password/i, /token/i, /auth/i,
    /private/i, /credential/i, /api.?key/i, /access.?token/i
];
function isSecretKey(key) {
    return SECRET_PATTERNS.some(p => p.test(key));
}
function parseEnvFile(content) {
    const result = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1)
            continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        }
        else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}
function loadEnvFiles(paths) {
    const merged = {};
    for (const path of paths) {
        const resolved = resolve(path);
        if (existsSync(resolved)) {
            const content = readFileSync(resolved, 'utf-8');
            const parsed = parseEnvFile(content);
            Object.assign(merged, parsed);
        }
    }
    return merged;
}
function validateAndTransform(env, schema) {
    const values = {};
    const secrets = new Set();
    const errors = [];
    for (const [key, field] of Object.entries(schema)) {
        const rawValue = env[key];
        if (rawValue === undefined) {
            if (field.default !== undefined) {
                values[key] = field.default;
                if (field.secret)
                    secrets.add(key);
                continue;
            }
            if (field.required !== false) {
                errors.push(`Missing required env: ${key}`);
                continue;
            }
            continue;
        }
        try {
            const validator = field.validator || BUILTIN_VALIDATORS[field.type];
            values[key] = validator(rawValue);
            if (field.secret || isSecretKey(key)) {
                secrets.add(key);
            }
        }
        catch (err) {
            errors.push(`Invalid ${key}: ${err.message}`);
        }
    }
    if (errors.length > 0) {
        throw new Error(`Config validation failed:\n${errors.join('\n')}`);
    }
    return { values, secrets };
}
export class EnvForge {
    config;
    options;
    watchers = [];
    isReloading = false;
    constructor(options) {
        this.options = options;
        this.config = this.loadConfig();
        if (options.watch) {
            this.setupWatchers();
        }
    }
    loadConfig() {
        const paths = this.options.envFiles || ['.env.local', '.env', '.env.defaults'];
        const fileEnv = loadEnvFiles(paths);
        const merged = { ...fileEnv, ...process.env };
        const { values, secrets } = validateAndTransform(merged, this.options.schema);
        return { values, secrets, schema: this.options.schema };
    }
    setupWatchers() {
        const paths = this.options.envFiles || ['.env.local', '.env'];
        for (const path of paths) {
            const resolved = resolve(path);
            if (existsSync(resolved)) {
                const watcher = watch(resolved, (eventType) => {
                    if (eventType === 'change' && !this.isReloading) {
                        this.reload();
                    }
                });
                this.watchers.push(watcher);
            }
        }
    }
    reload() {
        this.isReloading = true;
        try {
            const newConfig = this.loadConfig();
            this.config = newConfig;
            this.options.onReload?.(newConfig.values);
        }
        catch (err) {
            this.options.onError?.(err);
        }
        finally {
            setTimeout(() => { this.isReloading = false; }, 100);
        }
    }
    get values() {
        return this.config.values;
    }
    get(key) {
        return this.config.values[key];
    }
    has(key) {
        return this.config.values[key] !== undefined;
    }
    isSecret(key) {
        return this.config.secrets.has(key);
    }
    maskSecrets(obj) {
        const masked = {};
        for (const [key, value] of Object.entries(obj)) {
            if (this.config.secrets.has(key)) {
                masked[key] = '[REDACTED]';
            }
            else if (typeof value === 'object' && value !== null) {
                masked[key] = this.maskSecrets(value);
            }
            else {
                masked[key] = value;
            }
        }
        return masked;
    }
    toJSON() {
        return JSON.stringify(this.maskSecrets(this.config.values), null, 2);
    }
    destroy() {
        for (const watcher of this.watchers) {
            watcher.close();
        }
        this.watchers = [];
    }
}
export function forge(options) {
    return new EnvForge(options);
}
export function string(opts) {
    return { type: 'string', ...opts };
}
export function number(opts) {
    return { type: 'number', ...opts };
}
export function boolean(opts) {
    return { type: 'boolean', ...opts };
}
export function url(opts) {
    return { type: 'url', ...opts };
}
export function email(opts) {
    return { type: 'email', ...opts };
}
export function json(opts) {
    return { type: 'json', ...opts };
}
export function port(opts) {
    return { type: 'port', ...opts };
}
export function secret(field) {
    return { ...field, secret: true };
}
// Builder pattern classes for fluent API
class StringBuilder {
    field = { type: 'string' };
    default(value) {
        this.field.default = value;
        return this;
    }
    required(value = true) {
        this.field.required = value;
        return this;
    }
    secret() {
        this.field.secret = true;
        return this;
    }
    validator(fn) {
        this.field.validator = fn;
        return this;
    }
    build() {
        return this.field;
    }
}
class NumberBuilder {
    field = { type: 'number' };
    default(value) {
        this.field.default = value;
        return this;
    }
    required(value = true) {
        this.field.required = value;
        return this;
    }
    secret() {
        this.field.secret = true;
        return this;
    }
    validator(fn) {
        this.field.validator = fn;
        return this;
    }
    build() {
        return this.field;
    }
}
class BooleanBuilder {
    field = { type: 'boolean' };
    default(value) {
        this.field.default = value;
        return this;
    }
    required(value = true) {
        this.field.required = value;
        return this;
    }
    validator(fn) {
        this.field.validator = fn;
        return this;
    }
    build() {
        return this.field;
    }
}
class UrlBuilder {
    field = { type: 'url' };
    default(value) {
        this.field.default = value;
        return this;
    }
    required(value = true) {
        this.field.required = value;
        return this;
    }
    secret() {
        this.field.secret = true;
        return this;
    }
    validator(fn) {
        this.field.validator = fn;
        return this;
    }
    build() {
        return this.field;
    }
}
class EmailBuilder {
    field = { type: 'email' };
    default(value) {
        this.field.default = value;
        return this;
    }
    required(value = true) {
        this.field.required = value;
        return this;
    }
    secret() {
        this.field.secret = true;
        return this;
    }
    validator(fn) {
        this.field.validator = fn;
        return this;
    }
    build() {
        return this.field;
    }
}
class PortBuilder {
    field = { type: 'port' };
    default(value) {
        this.field.default = value;
        return this;
    }
    required(value = true) {
        this.field.required = value;
        return this;
    }
    validator(fn) {
        this.field.validator = fn;
        return this;
    }
    build() {
        return this.field;
    }
}
class JsonBuilder {
    field = { type: 'json' };
    default(value) {
        this.field.default = value;
        return this;
    }
    required(value = true) {
        this.field.required = value;
        return this;
    }
    validator(fn) {
        this.field.validator = fn;
        return this;
    }
    build() {
        return this.field;
    }
}
// Fluent API functions
export function str() {
    return new StringBuilder();
}
export function num() {
    return new NumberBuilder();
}
export function bool() {
    return new BooleanBuilder();
}
export function urlBuilder() {
    return new UrlBuilder();
}
export function emailBuilder() {
    return new EmailBuilder();
}
export function portBuilder() {
    return new PortBuilder();
}
export function jsonBuilder() {
    return new JsonBuilder();
}
//# sourceMappingURL=index.js.map