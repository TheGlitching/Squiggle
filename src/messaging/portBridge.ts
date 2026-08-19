/**
 * Port Stream Bridge & Auto-reconnecting Port Manager
 * Handles long-lived streaming channels, port lifecycle, disconnection handling, and automatic reconnection.
 */

import { ExtensionPort, UnifiedRuntime } from './runtime';
import { StreamEventMessage } from './types';

export interface PortBridgeOptions {
  portName: string;
  tabId?: number;
  frameId?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectIntervalMs?: number;
}

export type StreamChunkHandler<T> = (chunk: T) => void;
export type StreamErrorHandler = (error: Error) => void;
export type StreamCompleteHandler = () => void;

export interface StreamSubscription<T> {
  onChunk: (handler: StreamChunkHandler<T>) => StreamSubscription<T>;
  onError: (handler: StreamErrorHandler) => StreamSubscription<T>;
  onComplete: (handler: StreamCompleteHandler) => StreamSubscription<T>;
  cancel: () => void;
}

export class PortStreamBridge {
  private port: ExtensionPort | null = null;
  private options: Required<PortBridgeOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isExplicitlyClosed = false;

  private messageListeners = new Set<(message: unknown) => void>();
  private disconnectListeners = new Set<() => void>();
  private activeStreams = new Map<
    string,
    {
      onChunk?: (chunk: unknown) => void;
      onError?: (err: Error) => void;
      onComplete?: () => void;
    }
  >();

  constructor(options: PortBridgeOptions) {
    this.options = {
      portName: options.portName,
      tabId: options.tabId as number,
      frameId: options.frameId as number,
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      reconnectIntervalMs: options.reconnectIntervalMs ?? 1000,
    };
    this.connect();
  }

  public connect(): void {
    if (this.isExplicitlyClosed) return;

    try {
      this.port = UnifiedRuntime.connect({
        name: this.options.portName,
        tabId: this.options.tabId,
        frameId: this.options.frameId,
      });

      this.reconnectAttempts = 0;

      this.port.onMessage.addListener(this.handleIncomingMessage);
      this.port.onDisconnect.addListener(this.handleDisconnect);
    } catch {
      this.handleDisconnect();
    }
  }

  private handleIncomingMessage = (rawMessage: unknown): void => {
    if (rawMessage && typeof rawMessage === 'object' && '__isStreamEvent' in rawMessage) {
      const streamMsg = rawMessage as unknown as StreamEventMessage<unknown>;
      const streamHandler = this.activeStreams.get(streamMsg.streamId);
      if (streamHandler) {
        if (streamMsg.event === 'chunk') {
          streamHandler.onChunk?.(streamMsg.data);
        } else if (streamMsg.event === 'error') {
          streamHandler.onError?.(new Error(streamMsg.error || 'Stream error occurred'));
          this.activeStreams.delete(streamMsg.streamId);
        } else if (streamMsg.event === 'complete') {
          streamHandler.onComplete?.();
          this.activeStreams.delete(streamMsg.streamId);
        }
      }
    }

    for (const listener of this.messageListeners) {
      listener(rawMessage);
    }
  };

  private handleDisconnect = (): void => {
    this.port = null;

    // Fail any active streams
    const disconnectError = new Error(`Port '${this.options.portName}' disconnected`);
    for (const [, stream] of this.activeStreams) {
      stream.onError?.(disconnectError);
    }
    this.activeStreams.clear();

    for (const listener of this.disconnectListeners) {
      listener();
    }

    if (!this.isExplicitlyClosed && this.options.autoReconnect) {
      if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const backoff = this.options.reconnectIntervalMs * Math.min(Math.pow(1.5, this.reconnectAttempts - 1), 5);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, backoff);
      }
    }
  };

  public postMessage(message: unknown): void {
    if (!this.port) {
      throw new Error(`Cannot send message: Port '${this.options.portName}' is not connected`);
    }
    this.port.postMessage(message);
  }

  public isConnected(): boolean {
    return this.port !== null;
  }

  public onMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  /**
   * Listen to incoming stream events on this port by streamId
   */
  public subscribeStream<T>(streamId: string): StreamSubscription<T> {
    const handlers: {
      onChunk?: StreamChunkHandler<T>;
      onError?: StreamErrorHandler;
      onComplete?: StreamCompleteHandler;
    } = {};

    this.activeStreams.set(streamId, handlers as {
      onChunk?: (chunk: unknown) => void;
      onError?: (err: Error) => void;
      onComplete?: () => void;
    });

    const subscription: StreamSubscription<T> = {
      onChunk: (fn) => {
        handlers.onChunk = fn;
        return subscription;
      },
      onError: (fn) => {
        handlers.onError = fn;
        return subscription;
      },
      onComplete: (fn) => {
        handlers.onComplete = fn;
        return subscription;
      },
      cancel: () => {
        this.activeStreams.delete(streamId);
      },
    };

    return subscription;
  }

  /**
   * Stream source emitter: Send stream chunks and termination events over the port
   */
  public createStreamEmitter<T>(streamId: string) {
    return {
      sendChunk: (data: T) => {
        const msg: StreamEventMessage<T> = {
          __isStreamEvent: true,
          streamId,
          event: 'chunk',
          data,
        };
        this.postMessage(msg);
      },
      sendError: (error: string | Error) => {
        const errorMsg = error instanceof Error ? error.message : error;
        const msg: StreamEventMessage = {
          __isStreamEvent: true,
          streamId,
          event: 'error',
          error: errorMsg,
        };
        this.postMessage(msg);
      },
      sendComplete: () => {
        const msg: StreamEventMessage = {
          __isStreamEvent: true,
          streamId,
          event: 'complete',
        };
        this.postMessage(msg);
      },
    };
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.activeStreams.clear();
    this.messageListeners.clear();
    this.disconnectListeners.clear();
  }
}
