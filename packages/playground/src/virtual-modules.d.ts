declare module 'virtual:examples-manifest' {
  export interface ExampleEntry {
    name: string
    isLibrary: boolean
  }
  export const EXAMPLES: ExampleEntry[]
  export const EXAMPLE_NAMES: ReadonlySet<string>
  /** True for a raw `#include` path that's neither a known example nor a URL. */
  export function isMissingExample(path: string): boolean
}
