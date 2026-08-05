/**
 * The way a command reports its result. `default` is the human readable output,
 * `json` writes a single JSON document to stdout so a pipeline can act on it.
 */
export type OutputFormat = "default" | "json";
