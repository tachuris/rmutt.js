// Hand-written types for the build script, which test/payload.test.ts imports
// to assert the payload contract against the same code the build runs.
export declare const PAYLOAD_GLOBAL: string
export declare function assertSelfContained(source: string): void
export declare function buildPayload(): Promise<string>
