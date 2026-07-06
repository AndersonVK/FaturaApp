/**
 * Polyfills para APIs que o pdf.js usa sem proteção e que só existem em
 * WebKit muito recente. No iPhone, TODOS os navegadores (Chrome incluído)
 * usam o motor do Safari, então sem isso a leitura de PDF quebra em
 * qualquer iOS anterior com "undefined is not a function (near '...e of t...')".
 *
 * - Iteração assíncrona de ReadableStream (`for await (const chunk of stream)`),
 *   usada pelo getTextContent() do pdf.js: só existe a partir do Safari 18.4.
 * - Promise.try, usada pelo MessageHandler do pdf.js: só a partir do Safari 18.2.
 *
 * Este módulo precisa ser importado ANTES do pdf.js.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const rsProto =
  typeof ReadableStream !== 'undefined' ? (ReadableStream.prototype as any) : undefined;

if (rsProto && !rsProto[Symbol.asyncIterator]) {
  rsProto.values ??= function (this: ReadableStream, { preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const resultado = await reader.read();
          if (resultado.done) reader.releaseLock();
          return resultado;
        } catch (e) {
          reader.releaseLock();
          throw e;
        }
      },
      async return(value?: unknown) {
        const cancelamento = preventCancel ? undefined : reader.cancel(value);
        reader.releaseLock();
        await cancelamento;
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
  rsProto[Symbol.asyncIterator] = rsProto.values;
}

const promiseCtor = Promise as any;
if (typeof promiseCtor.try !== 'function') {
  promiseCtor.try = function (fn: (...args: unknown[]) => unknown, ...args: unknown[]) {
    // Se fn lançar de forma síncrona, o executor lança e a promise rejeita -
    // mesma semântica do Promise.try nativo.
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

export {};
