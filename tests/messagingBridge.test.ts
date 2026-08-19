import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnifiedRuntime } from '../src/messaging/runtime';
import { TypedMessageBus } from '../src/messaging/messageBus';
import { PortStreamBridge } from '../src/messaging/portBridge';

describe('Messaging Bridge', () => {
  let mockRuntimeListeners: Array<(msg: unknown, sender: unknown, sendResp: (r?: unknown) => void) => boolean | void>;
  let mockMessagePort: {
    name: string;
    postMessage: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onMessage: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
    onDisconnect: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockRuntimeListeners = [];

    mockMessagePort = {
      name: 'test-port',
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    };

    // Setup global chrome mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: unknown, callback?: (resp: unknown) => void) => {
          let handledAsync = false;
          for (const listener of mockRuntimeListeners) {
            const res = listener(msg, { id: 'mock-sender' }, (resp) => {
              callback?.(resp);
            });
            if (res === true) handledAsync = true;
          }
          if (!handledAsync && callback) {
            callback(undefined);
          }
        }),
        onMessage: {
          addListener: vi.fn((listener) => {
            mockRuntimeListeners.push(listener);
          }),
          removeListener: vi.fn((listener) => {
            const idx = mockRuntimeListeners.indexOf(listener);
            if (idx >= 0) mockRuntimeListeners.splice(idx, 1);
          }),
        },
        connect: vi.fn(() => mockMessagePort),
        onConnect: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
        lastError: null,
      },
      tabs: {
        query: vi.fn((queryInfo, callback) => {
          callback([{ id: 123, url: 'https://example.com', active: true }]);
        }),
        sendMessage: vi.fn((tabId: number, msg: unknown, callback?: (resp: unknown) => void) => {
          if (callback) {
            for (const listener of mockRuntimeListeners) {
              listener(msg, { tab: { id: tabId } }, (resp) => {
                callback(resp);
              });
            }
          }
        }),
        connect: vi.fn(() => mockMessagePort),
      },
    };
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).chrome;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).browser;
  });

  describe('UnifiedRuntime', () => {
    it('abstracts runtime getURL and getActiveTab', async () => {
      const url = UnifiedRuntime.getURL('popup.html');
      expect(url).toBe('chrome-extension://mock-id/popup.html');

      const activeTab = await UnifiedRuntime.getActiveTab();
      expect(activeTab).toBeDefined();
      expect(activeTab?.id).toBe(123);
    });

    it('works with Firefox browser.* global object', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).chrome;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).browser = {
        runtime: {
          getURL: (path: string) => `moz-extension://firefox-id/${path}`,
          sendMessage: vi.fn().mockResolvedValue({ status: 'firefox-ok' }),
        },
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 456, active: true }]),
        },
      };

      const url = UnifiedRuntime.getURL('sidebar.html');
      expect(url).toBe('moz-extension://firefox-id/sidebar.html');

      const resp = await UnifiedRuntime.sendMessage({ ping: true });
      expect(resp).toEqual({ status: 'firefox-ok' });

      const activeTab = await UnifiedRuntime.getActiveTab();
      expect(activeTab?.id).toBe(456);
    });
  });

  describe('TypedMessageBus', () => {
    it('handles unidirectional dispatch across contexts', async () => {
      const busSender = new TypedMessageBus('sidepanel');
      const busReceiver = new TypedMessageBus('background');

      const received: string[] = [];
      busReceiver.on<string>('TEST_EVENT', (payload) => {
        received.push(payload);
      });

      await busSender.dispatch('TEST_EVENT', 'hello-world');
      expect(received).toEqual(['hello-world']);

      busSender.destroy();
      busReceiver.destroy();
    });

    it('handles request-response RPC with async execution', async () => {
      const busClient = new TypedMessageBus('content-script');
      const busServer = new TypedMessageBus('background');

      interface TestRPCMap {
        CALCULATE_SUM: {
          request: { a: number; b: number };
          response: { sum: number };
        };
      }

      busServer.registerRPC<keyof TestRPCMap, TestRPCMap>('CALCULATE_SUM', async (req) => {
        return { sum: req.a + req.b };
      });

      const res = await busClient.callRPC<keyof TestRPCMap, TestRPCMap>('CALCULATE_SUM', { a: 10, b: 25 });
      expect(res).toEqual({ sum: 35 });

      busClient.destroy();
      busServer.destroy();
    });

    it('handles RPC errors properly', async () => {
      const busClient = new TypedMessageBus('content-script');
      const busServer = new TypedMessageBus('background');

      busServer.registerRPC('FAILING_RPC', async () => {
        throw new Error('Database connection failed');
      });

      await expect(busClient.callRPC('FAILING_RPC', {})).rejects.toThrow('Database connection failed');

      busClient.destroy();
      busServer.destroy();
    });
  });

  describe('PortStreamBridge', () => {
    it('establishes port connection and streams chunks', () => {
      let messageCallback: ((msg: unknown) => void) | undefined;
      mockMessagePort.onMessage.addListener.mockImplementation((cb) => {
        messageCallback = cb;
      });

      const bridge = new PortStreamBridge({ portName: 'analysis-stream' });
      expect(bridge.isConnected()).toBe(true);

      const receivedChunks: string[] = [];
      let isCompleted = false;

      bridge.subscribeStream<string>('stream-123')
        .onChunk((chunk) => {
          receivedChunks.push(chunk);
        })
        .onComplete(() => {
          isCompleted = true;
        });

      // Simulate incoming stream chunk from background
      messageCallback?.({
        __isStreamEvent: true,
        streamId: 'stream-123',
        event: 'chunk',
        data: 'first-chunk',
      });

      messageCallback?.({
        __isStreamEvent: true,
        streamId: 'stream-123',
        event: 'chunk',
        data: 'second-chunk',
      });

      messageCallback?.({
        __isStreamEvent: true,
        streamId: 'stream-123',
        event: 'complete',
      });

      expect(receivedChunks).toEqual(['first-chunk', 'second-chunk']);
      expect(isCompleted).toBe(true);

      bridge.disconnect();
    });

    it('emits stream events correctly', () => {
      const bridge = new PortStreamBridge({ portName: 'emitter-port' });
      const emitter = bridge.createStreamEmitter<number>('stream-xyz');

      emitter.sendChunk(42);
      expect(mockMessagePort.postMessage).toHaveBeenCalledWith({
        __isStreamEvent: true,
        streamId: 'stream-xyz',
        event: 'chunk',
        data: 42,
      });

      emitter.sendComplete();
      expect(mockMessagePort.postMessage).toHaveBeenCalledWith({
        __isStreamEvent: true,
        streamId: 'stream-xyz',
        event: 'complete',
      });

      bridge.disconnect();
    });

    it('handles port disconnection with stream error notifications', () => {
      let disconnectCallback: (() => void) | undefined;
      mockMessagePort.onDisconnect.addListener.mockImplementation((cb) => {
        disconnectCallback = cb;
      });

      const bridge = new PortStreamBridge({ portName: 'disconnect-test', autoReconnect: false });

      let streamError: Error | null = null;
      bridge.subscribeStream('stream-aborted')
        .onError((err) => {
          streamError = err;
        });

      // Trigger port disconnect
      disconnectCallback?.();

      expect(streamError).not.toBeNull();
      expect((streamError as unknown as Error).message).toContain("Port 'disconnect-test' disconnected");
      expect(bridge.isConnected()).toBe(false);
    });
  });
});
