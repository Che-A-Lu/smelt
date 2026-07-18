// ============================================================
// Web Worker 沙箱
// 隔离执行卡片脚本——无 DOM、无 fetch、无 FS 直访
// ============================================================

type SandboxMessage =
  | { type: "run"; scriptId: string; code: string }
  | { type: "result"; scriptId: string; ok: boolean; output: string; error: string };

const WORKER_CODE = `
self.fetch = () => { throw new Error("fetch is disabled in sandbox"); };
self.XMLHttpRequest = undefined as any;
self.WebSocket = undefined as any;
self.localStorage = undefined as any;
self.sessionStorage = undefined as any;
self.indexedDB = undefined as any;
self.document = undefined as any;
self.window = undefined as any;

const origLog = console.log;
console.log = (...args: any[]) => {
  origLog.apply(console, args);
  (self as any).postMessage({ type: "log", text: args.map(String).join(" ") });
};

(self as any).sandbox = { fetch: undefined, readFile: undefined, writeFile: undefined };

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "run") {
    try {
      const fn = new Function("sandbox", "console", msg.code);
      const result = fn((self as any).sandbox, console);
      const output = result !== undefined ? String(result) : "Script executed (no return value)";
      (self as any).postMessage({ type: "result", scriptId: msg.scriptId, ok: true, output, error: "" });
    } catch (err: any) {
      (self as any).postMessage({ type: "result", scriptId: msg.scriptId, ok: false, output: "", error: err?.message ?? String(err) });
    }
  }
};
`;

export interface ScriptResult {
  scriptId: string;
  ok: boolean;
  output: string;
  error: string;
}

export class CardSandbox {
  private worker: Worker;
  private pending = new Map<string, { resolve: (r: ScriptResult) => void }>();
  private onLog: ((text: string) => void) | null = null;

  constructor() {
    const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
    this.worker = new Worker(URL.createObjectURL(blob));
    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as SandboxMessage | { type: "log"; text: string };
      if (msg.type === "result") {
        const cb = this.pending.get(msg.scriptId);
        if (cb) { cb.resolve({ scriptId: msg.scriptId, ok: msg.ok, output: msg.output, error: msg.error }); this.pending.delete(msg.scriptId); }
      } else if (msg.type === "log") {
        this.onLog?.(msg.text);
      }
    };
  }

  async runScript(code: string): Promise<ScriptResult> {
    const scriptId = Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      this.pending.set(scriptId, { resolve });
      this.worker.postMessage({ type: "run", scriptId, code });
    });
  }

  onConsoleLog(fn: (text: string) => void): void { this.onLog = fn; }

  terminate(): void { this.worker.terminate(); this.pending.clear(); }
}

let sandbox: CardSandbox | null = null;

export function getSandbox(): CardSandbox {
  if (!sandbox) sandbox = new CardSandbox();
  return sandbox;
}
