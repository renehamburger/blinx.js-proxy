import * as http from 'http';
import { HandleFunction } from 'connect';
import { Readable, Writable, Duplex } from 'stream';

declare namespace Harmon {

  interface StreamOptions {
    /** User outer html content instead of inner; default: false */
    outer?: boolean;
  }

  interface Node {
    readonly name: string
    createReadStream(opts?: StreamOptions): Readable;
    createStream(opts?: StreamOptions): Duplex;
    createWriteStream(opts?: StreamOptions): Writable;
    getAttribute(key: string, cb: () => any): this;
    getAttributes(cb: () => any[]): this;
    removeAttribute(key: string): this;
    setAttribute(key: string, value: any): this;
  }

  interface Selector {
    query: string;
    func: (node: Node, req: http.IncomingMessage, res: http.ServerResponse) => void;
  }

  interface HarmonEngine {
    (reqSelectors: Selector[], resSelectors: Selector[], htmlOnly?: boolean /*= false*/): HandleFunction;
  }
}

declare const Harmon: Harmon.HarmonEngine;
export = Harmon;
