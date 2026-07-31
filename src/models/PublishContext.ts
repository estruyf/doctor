export interface PublishContext {
  files: string[];
}

/** Minimal interface for writing live output to the current Listr task. */
export type TaskOutput = { output: string };
