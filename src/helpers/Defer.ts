import { Deferred } from '../models';

export function defer<T>(): Deferred<T> {
  let resolve: (result: T) => void;
  let reject: (err: T) => void;

  const promise: Promise<T> = new Promise<T>((a, b): void => {
    resolve = a;
    reject = b;
  });

  return {
    resolve: resolve,
    reject: reject,
    promise: promise
  };
}