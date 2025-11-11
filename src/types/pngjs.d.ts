declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Uint8Array;
    constructor(options?: { width?: number; height?: number });
    static sync: {
      write(png: PNG): Buffer;
    };
  }
  export = { PNG: PNG };
}
