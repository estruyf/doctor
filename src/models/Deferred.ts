export interface Deferred<T> {
  resolve: (result: T) => void;
  reject: (err: T) => void;
  promise: Promise<T>;
}