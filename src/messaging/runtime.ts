/**
 * Cross-browser MV3 Unified Runtime API Wrapper
 * Abstracting differences between chrome.* and browser.* (Chrome MV3 vs Firefox MV3).
 */

export interface ExtensionTab {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
  status?: string;
}

export interface ExtensionPort {
  name: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: {
    addListener(callback: (message: unknown, port: ExtensionPort) => void): void;
    removeListener(callback: (message: unknown, port: ExtensionPort) => void): void;
  };
  onDisconnect: {
    addListener(callback: (port: ExtensionPort) => void): void;
    removeListener(callback: (port: ExtensionPort) => void): void;
  };
}

export interface RuntimeMessageSender {
  id?: string;
  url?: string;
  tab?: ExtensionTab;
  frameId?: number;
}

export type MessageResponseCallback = (response?: unknown) => void;
export type RuntimeMessageListener = (
  message: unknown,
  sender: RuntimeMessageSender,
  sendResponse: MessageResponseCallback
) => boolean | void | Promise<unknown>;

interface BrowserNamespace {
  runtime?: typeof chrome.runtime;
  tabs?: typeof chrome.tabs;
}

export class UnifiedRuntime {
  public static getRuntime(): typeof chrome.runtime {
    const browserGlobal = (globalThis as unknown as { browser?: BrowserNamespace }).browser;
    if (browserGlobal && browserGlobal.runtime) {
      return browserGlobal.runtime;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime;
    }
    throw new Error('No compatible browser runtime detected');
  }

  public static getTabs(): typeof chrome.tabs {
    const browserGlobal = (globalThis as unknown as { browser?: BrowserNamespace }).browser;
    if (browserGlobal && browserGlobal.tabs) {
      return browserGlobal.tabs;
    }
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      return chrome.tabs;
    }
    throw new Error('No compatible browser tabs API detected');
  }

  public static getURL(path: string): string {
    return this.getRuntime().getURL(path);
  }

  public static async sendMessage<TResponse = unknown>(
    message: unknown,
    options?: { extensionId?: string }
  ): Promise<TResponse> {
    const runtime = this.getRuntime();
    if (options?.extensionId) {
      return runtime.sendMessage(options.extensionId, message) as Promise<TResponse>;
    }
    return new Promise<TResponse>((resolve, reject) => {
      try {
        const maybePromise = runtime.sendMessage(message, (response: TResponse) => {
          const lastError = runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message || 'Extension runtime message error'));
          } else {
            resolve(response);
          }
        });

        if (maybePromise && typeof (maybePromise as Promise<TResponse>).then === 'function') {
          (maybePromise as Promise<TResponse>).then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  public static async sendTabMessage<TResponse = unknown>(
    tabId: number,
    message: unknown,
    options?: { frameId?: number }
  ): Promise<TResponse> {
    const tabs = this.getTabs();
    const runtime = this.getRuntime();
    return new Promise<TResponse>((resolve, reject) => {
      try {
        const sendOptions = options?.frameId !== undefined ? { frameId: options.frameId } : undefined;
        const callback = (response: TResponse) => {
          const lastError = runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message || `Failed to send message to tab ${tabId}`));
          } else {
            resolve(response);
          }
        };

        const maybePromise = sendOptions
          ? tabs.sendMessage(tabId, message, sendOptions, callback)
          : tabs.sendMessage(tabId, message, callback);

        if (maybePromise && typeof (maybePromise as Promise<TResponse>).then === 'function') {
          (maybePromise as Promise<TResponse>).then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  public static onMessage(listener: RuntimeMessageListener): () => void {
    const runtime = this.getRuntime();
    const wrappedListener = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      const result = listener(message, sender as RuntimeMessageSender, sendResponse);
      if (result instanceof Promise) {
        result
          .then((res) => sendResponse(res))
          .catch((err) => sendResponse({ __isRpcResponse: true, success: false, error: err?.message || String(err) }));
        return true;
      }
      return result;
    };

    runtime.onMessage.addListener(wrappedListener);
    return () => runtime.onMessage.removeListener(wrappedListener);
  }

  public static connect(options: { name?: string; tabId?: number; frameId?: number }): ExtensionPort {
    const runtime = this.getRuntime();
    const tabs = this.getTabs();

    if (options.tabId !== undefined) {
      const connectInfo: chrome.tabs.ConnectInfo = {
        name: options.name,
        frameId: options.frameId,
      };
      return tabs.connect(options.tabId, connectInfo) as unknown as ExtensionPort;
    }

    return runtime.connect({ name: options.name }) as unknown as ExtensionPort;
  }

  public static onConnect(listener: (port: ExtensionPort) => void): () => void {
    const runtime = this.getRuntime();
    const callback = (port: chrome.runtime.Port) => {
      listener(port as unknown as ExtensionPort);
    };
    runtime.onConnect.addListener(callback);
    return () => runtime.onConnect.removeListener(callback);
  }

  public static async queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<ExtensionTab[]> {
    const tabs = this.getTabs();
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = tabs.query(queryInfo, (result) => {
          const lastError = this.getRuntime().lastError;
          if (lastError) {
            reject(new Error(lastError.message));
          } else {
            resolve(result as ExtensionTab[]);
          }
        });

        if (maybePromise && typeof (maybePromise as Promise<ExtensionTab[]>).then === 'function') {
          (maybePromise as Promise<ExtensionTab[]>).then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  public static async getActiveTab(): Promise<ExtensionTab | null> {
    const tabs = await this.queryTabs({ active: true, currentWindow: true });
    return tabs.length > 0 ? tabs[0] : null;
  }
}
