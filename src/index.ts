import { readFileSync, existsSync, watch } from 'fs';
import { resolve } from 'path';

export type ValidatorFn<T> = (value: string) => T;
export type EnvType = 'string' | 'number' | 'boolean' | 'url' | 'email' | 'json' | 'port';

interface SchemaField<T> {
  type: EnvType;
  required?: boolean;
  default?: T;
  secret?: boolean;
  validator?: ValidatorFn<T>;
}

export type Schema<T extends Record<string, any>> = {
  [K in keyof T]: SchemaField<T[K]>;
};

interface LoadedConfig<T extends Record<string, any>> {
  values: T;
  secrets: Set<string>;
  schema: Schema<T>;
}

const BUILTIN_VALIDATORS: Record<EnvType, ValidatorFn<any>> = {
  string: (v) => v,
  number: (v) => {
    const n = Number(v);
    if (isNaN(n)) throw new Error(`Invalid number: ${v}`);
    return n;
  },
  boolean: (v) => {
    const lower = v.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    throw new Error(`Invalid boolean: ${v}`);
  },
  url: (v) => {
    try {
      new URL(v);
      return v;
    } catch {
      throw new Error(`Invalid URL: ${v}`);
    }
  },
  email: (v) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(v)) throw new Error(`Invalid email: ${v}`);
    return v;
  },
  json: (v) => {
    try {
      return JSON.parse(v);
    } catch {
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

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some(p => p.test(key));
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    
    result[key] = value;
  }
  
  return result;
}

function loadEnvFiles(paths: string[]): Record<string, string> {
  const merged: Record<string, string> = {};
  
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

function validateAndTransform<T extends Record<string, any>>(
  env: Record<string, string | undefined>,
  schema: Schema<T>
): { values: T; secrets: Set<string> } {
  const values = {} as T;
  const secrets = new Set<string>();
  const errors: string[] = [];
  
  for (const [key, field] of Object.entries(schema)) {
    const rawValue = env[key];
    
    if (rawValue === undefined) {
      if (field.default !== undefined) {
        values[key as keyof T] = field.default;
        if (field.secret) secrets.add(key);
        continue;
      }
      if (field.required !== false) {
        errors.push(`Missing required env: ${key}`);
        continue;
      }
      continue;
    }
    
    try {
      const validator = field.validator || BUILTIN_VALIDATORS[field.type as EnvType];
      values[key as keyof T] = validator(rawValue);
      
      if (field.secret || isSecretKey(key)) {
        secrets.add(key);
      }
    } catch (err) {
      errors.push(`Invalid ${key}: ${(err as Error).message}`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.join('\n')}`);
  }
  
  return { values, secrets };
}

export interface ForgeOptions<T extends Record<string, any>> {
  schema: Schema<T>;
  envFiles?: string[];
  watch?: boolean;
  onReload?: (config: T) => void;
  onError?: (error: Error) => void;
}

export class EnvForge<T extends Record<string, any>> {
  private config: LoadedConfig<T>;
  private options: ForgeOptions<T>;
  private watchers: ReturnType<typeof watch>[] = [];
  private isReloading = false;
  
  constructor(options: ForgeOptions<T>) {
    this.options = options;
    this.config = this.loadConfig();
    
    if (options.watch) {
      this.setupWatchers();
    }
  }
  
  private loadConfig(): LoadedConfig<T> {
    const paths = this.options.envFiles || ['.env.local', '.env', '.env.defaults'];
    const fileEnv = loadEnvFiles(paths);
    const merged = { ...fileEnv, ...process.env };
    
    const { values, secrets } = validateAndTransform(merged, this.options.schema);
    
    return { values, secrets, schema: this.options.schema };
  }
  
  private setupWatchers(): void {
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
  
  private reload(): void {
    this.isReloading = true;
    
    try {
      const newConfig = this.loadConfig();
      this.config = newConfig;
      this.options.onReload?.(newConfig.values);
    } catch (err) {
      this.options.onError?.(err as Error);
    } finally {
      setTimeout(() => { this.isReloading = false; }, 100);
    }
  }
  
  get values(): T {
    return this.config.values;
  }
  
  get<K extends keyof T>(key: K): T[K] {
    return this.config.values[key];
  }
  
  has<K extends keyof T>(key: K): boolean {
    return this.config.values[key] !== undefined;
  }
  
  isSecret(key: string): boolean {
    return this.config.secrets.has(key);
  }
  
  maskSecrets(obj: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (this.config.secrets.has(key)) {
        masked[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSecrets(value);
      } else {
        masked[key] = value;
      }
    }
    
    return masked;
  }
  
  toJSON(): string {
    return JSON.stringify(this.maskSecrets(this.config.values), null, 2);
  }
  
  destroy(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}

export function forge<T extends Record<string, any>>(options: ForgeOptions<T>): EnvForge<T> {
  return new EnvForge(options);
}

export function string(opts?: Omit<SchemaField<string>, 'type'>): SchemaField<string> {
  return { type: 'string', ...opts };
}

export function number(opts?: Omit<SchemaField<number>, 'type'>): SchemaField<number> {
  return { type: 'number', ...opts };
}

export function boolean(opts?: Omit<SchemaField<boolean>, 'type'>): SchemaField<boolean> {
  return { type: 'boolean', ...opts };
}

export function url(opts?: Omit<SchemaField<string>, 'type'>): SchemaField<string> {
  return { type: 'url', ...opts };
}

export function email(opts?: Omit<SchemaField<string>, 'type'>): SchemaField<string> {
  return { type: 'email', ...opts };
}

export function json<T = any>(opts?: Omit<SchemaField<T>, 'type'>): SchemaField<T> {
  return { type: 'json', ...opts };
}

export function port(opts?: Omit<SchemaField<number>, 'type'>): SchemaField<number> {
  return { type: 'port', ...opts };
}

export function secret<T>(field: SchemaField<T>): SchemaField<T> {
  return { ...field, secret: true };
}

// Builder pattern classes for fluent API
class StringBuilder {
  private field: SchemaField<string> = { type: 'string' };
  
  default(value: string): this {
    this.field.default = value;
    return this;
  }
  
  required(value = true): this {
    this.field.required = value;
    return this;
  }
  
  secret(): this {
    this.field.secret = true;
    return this;
  }
  
  validator(fn: ValidatorFn<string>): this {
    this.field.validator = fn;
    return this;
  }
  
  build(): SchemaField<string> {
    return this.field;
  }
}

class NumberBuilder {
  private field: SchemaField<number> = { type: 'number' };
  
  default(value: number): this {
    this.field.default = value;
    return this;
  }
  
  required(value = true): this {
    this.field.required = value;
    return this;
  }
  
  secret(): this {
    this.field.secret = true;
    return this;
  }
  
  validator(fn: ValidatorFn<number>): this {
    this.field.validator = fn;
    return this;
  }
  
  build(): SchemaField<number> {
    return this.field;
  }
}

class BooleanBuilder {
  private field: SchemaField<boolean> = { type: 'boolean' };
  
  default(value: boolean): this {
    this.field.default = value;
    return this;
  }
  
  required(value = true): this {
    this.field.required = value;
    return this;
  }
  
  validator(fn: ValidatorFn<boolean>): this {
    this.field.validator = fn;
    return this;
  }
  
  build(): SchemaField<boolean> {
    return this.field;
  }
}

class UrlBuilder {
  private field: SchemaField<string> = { type: 'url' };
  
  default(value: string): this {
    this.field.default = value;
    return this;
  }
  
  required(value = true): this {
    this.field.required = value;
    return this;
  }
  
  secret(): this {
    this.field.secret = true;
    return this;
  }
  
  validator(fn: ValidatorFn<string>): this {
    this.field.validator = fn;
    return this;
  }
  
  build(): SchemaField<string> {
    return this.field;
  }
}

class EmailBuilder {
  private field: SchemaField<string> = { type: 'email' };
  
  default(value: string): this {
    this.field.default = value;
    return this;
  }
  
  required(value = true): this {
    this.field.required = value;
    return this;
  }
  
  secret(): this {
    this.field.secret = true;
    return this;
  }
  
  validator(fn: ValidatorFn<string>): this {
    this.field.validator = fn;
    return this;
  }
  
  build(): SchemaField<string> {
    return this.field;
  }
}

class PortBuilder {
  private field: SchemaField<number> = { type: 'port' };
  
  default(value: number): this {
    this.field.default = value;
    return this;
  }
  
  required(value = true): this {
    this.field.required = value;
    return this;
  }
  
  validator(fn: ValidatorFn<number>): this {
    this.field.validator = fn;
    return this;
  }
  
  build(): SchemaField<number> {
    return this.field;
  }
}

class JsonBuilder<T = any> {
  private field: SchemaField<T> = { type: 'json' };
  
  default(value: T): this {
    this.field.default = value;
    return this;
  }
  
  required(value = true): this {
    this.field.required = value;
    return this;
  }
  
  validator(fn: ValidatorFn<T>): this {
    this.field.validator = fn;
    return this;
  }
  
  build(): SchemaField<T> {
    return this.field;
  }
}

// Fluent API functions
export function str(): StringBuilder {
  return new StringBuilder();
}

export function num(): NumberBuilder {
  return new NumberBuilder();
}

export function bool(): BooleanBuilder {
  return new BooleanBuilder();
}

export function urlBuilder(): UrlBuilder {
  return new UrlBuilder();
}

export function emailBuilder(): EmailBuilder {
  return new EmailBuilder();
}

export function portBuilder(): PortBuilder {
  return new PortBuilder();
}

export function jsonBuilder<T = any>(): JsonBuilder<T> {
  return new JsonBuilder<T>();
}
