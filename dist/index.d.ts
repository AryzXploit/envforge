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
export interface ForgeOptions<T extends Record<string, any>> {
    schema: Schema<T>;
    envFiles?: string[];
    watch?: boolean;
    onReload?: (config: T) => void;
    onError?: (error: Error) => void;
}
export declare class EnvForge<T extends Record<string, any>> {
    private config;
    private options;
    private watchers;
    private isReloading;
    constructor(options: ForgeOptions<T>);
    private loadConfig;
    private setupWatchers;
    private reload;
    get values(): T;
    get<K extends keyof T>(key: K): T[K];
    has<K extends keyof T>(key: K): boolean;
    isSecret(key: string): boolean;
    maskSecrets(obj: Record<string, any>): Record<string, any>;
    toJSON(): string;
    destroy(): void;
}
export declare function forge<T extends Record<string, any>>(options: ForgeOptions<T>): EnvForge<T>;
export declare function string(opts?: Omit<SchemaField<string>, 'type'>): SchemaField<string>;
export declare function number(opts?: Omit<SchemaField<number>, 'type'>): SchemaField<number>;
export declare function boolean(opts?: Omit<SchemaField<boolean>, 'type'>): SchemaField<boolean>;
export declare function url(opts?: Omit<SchemaField<string>, 'type'>): SchemaField<string>;
export declare function email(opts?: Omit<SchemaField<string>, 'type'>): SchemaField<string>;
export declare function json<T = any>(opts?: Omit<SchemaField<T>, 'type'>): SchemaField<T>;
export declare function port(opts?: Omit<SchemaField<number>, 'type'>): SchemaField<number>;
export declare function secret<T>(field: SchemaField<T>): SchemaField<T>;
declare class StringBuilder {
    private field;
    default(value: string): this;
    required(value?: boolean): this;
    secret(): this;
    validator(fn: ValidatorFn<string>): this;
    build(): SchemaField<string>;
}
declare class NumberBuilder {
    private field;
    default(value: number): this;
    required(value?: boolean): this;
    secret(): this;
    validator(fn: ValidatorFn<number>): this;
    build(): SchemaField<number>;
}
declare class BooleanBuilder {
    private field;
    default(value: boolean): this;
    required(value?: boolean): this;
    validator(fn: ValidatorFn<boolean>): this;
    build(): SchemaField<boolean>;
}
declare class UrlBuilder {
    private field;
    default(value: string): this;
    required(value?: boolean): this;
    secret(): this;
    validator(fn: ValidatorFn<string>): this;
    build(): SchemaField<string>;
}
declare class EmailBuilder {
    private field;
    default(value: string): this;
    required(value?: boolean): this;
    secret(): this;
    validator(fn: ValidatorFn<string>): this;
    build(): SchemaField<string>;
}
declare class PortBuilder {
    private field;
    default(value: number): this;
    required(value?: boolean): this;
    validator(fn: ValidatorFn<number>): this;
    build(): SchemaField<number>;
}
declare class JsonBuilder<T = any> {
    private field;
    default(value: T): this;
    required(value?: boolean): this;
    validator(fn: ValidatorFn<T>): this;
    build(): SchemaField<T>;
}
export declare function str(): StringBuilder;
export declare function num(): NumberBuilder;
export declare function bool(): BooleanBuilder;
export declare function urlBuilder(): UrlBuilder;
export declare function emailBuilder(): EmailBuilder;
export declare function portBuilder(): PortBuilder;
export declare function jsonBuilder<T = any>(): JsonBuilder<T>;
export {};
//# sourceMappingURL=index.d.ts.map