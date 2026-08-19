/**
 * Typed Message Bus & Cross-Context Dispatcher
 * Supporting unidirectional dispatch, request-response RPC, and streaming channels across contexts.
 */

import { UnifiedRuntime, RuntimeMessageSender } from './runtime';
import { BaseMessage, ContextType, RPCRequestMessage, RPCResponseMessage, RPCProtocolMap } from './types';

export interface BusHandlerOptions {
  sourceContext?: ContextType;
}

export type MessageHandler<TPayload = unknown> = (
  payload: TPayload,
  sender: RuntimeMessageSender
) => void;

export type RPCHandler<TRequest = unknown, TResponse = unknown> = (
  request: TRequest,
  sender: RuntimeMessageSender
) => Promise<TResponse> | TResponse;

export class TypedMessageBus {
  private currentContext: ContextType;
  private messageHandlers = new Map<string, Set<MessageHandler<unknown>>>();
  private rpcHandlers = new Map<string, RPCHandler<unknown, unknown>>();
  private cleanupRuntimeListener: (() => void) | null = null;

  constructor(currentContext: ContextType = 'background') {
    this.currentContext = currentContext;
    this.initRuntimeListener();
  }

  private initRuntimeListener(): void {
    this.cleanupRuntimeListener = UnifiedRuntime.onMessage((rawMessage, sender, sendResponse) => {
      if (!rawMessage || typeof rawMessage !== 'object') {
        return;
      }

      // Check if it is an RPC Request
      if ('__isRpcRequest' in rawMessage) {
        const rpcReq = rawMessage as unknown as RPCRequestMessage;
        const handler = this.rpcHandlers.get(rpcReq.type);
        if (handler) {
          try {
            const maybePromise = handler(rpcReq.payload, sender);
            if (maybePromise instanceof Promise) {
              maybePromise
                .then((result) => {
                  const resp: RPCResponseMessage = {
                    __isRpcResponse: true,
                    requestId: rpcReq.requestId,
                    success: true,
                    result,
                  };
                  sendResponse(resp);
                })
                .catch((err: Error) => {
                  const resp: RPCResponseMessage = {
                    __isRpcResponse: true,
                    requestId: rpcReq.requestId,
                    success: false,
                    error: err?.message || 'RPC execution error',
                  };
                  sendResponse(resp);
                });
              return true; // Keep channel open for async response
            } else {
              const resp: RPCResponseMessage = {
                __isRpcResponse: true,
                requestId: rpcReq.requestId,
                success: true,
                result: maybePromise,
              };
              sendResponse(resp);
              return;
            }
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const resp: RPCResponseMessage = {
              __isRpcResponse: true,
              requestId: rpcReq.requestId,
              success: false,
              error: errorMsg,
            };
            sendResponse(resp);
            return;
          }
        }
        return;
      }

      // Check if it is a standard unidirectional dispatch message
      if ('type' in rawMessage && 'payload' in rawMessage) {
        const msg = rawMessage as unknown as BaseMessage;
        const handlers = this.messageHandlers.get(msg.type);
        if (handlers && handlers.size > 0) {
          for (const handler of handlers) {
            try {
              handler(msg.payload, sender);
            } catch (err) {
              console.error(`Error handling message of type ${msg.type}:`, err);
            }
          }
        }
      }
    });
  }

  /**
   * Dispatch unidirectional message to runtime
   */
  public async dispatch<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    targetTabId?: number
  ): Promise<void> {
    const msg: BaseMessage<TType, TPayload> = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      payload,
      timestamp: Date.now(),
      sourceContext: this.currentContext,
    };

    if (targetTabId !== undefined) {
      await UnifiedRuntime.sendTabMessage(targetTabId, msg);
    } else {
      await UnifiedRuntime.sendMessage(msg);
    }
  }

  /**
   * Register a listener for a unidirectional message type
   */
  public on<TPayload>(type: string, handler: MessageHandler<TPayload>): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    const handlers = this.messageHandlers.get(type)!;
    handlers.add(handler as MessageHandler<unknown>);

    return () => {
      handlers.delete(handler as MessageHandler<unknown>);
      if (handlers.size === 0) {
        this.messageHandlers.delete(type);
      }
    };
  }

  /**
   * Send RPC request and await response
   */
  public async callRPC<TType extends keyof TRPCMap & string, TRPCMap extends RPCProtocolMap = RPCProtocolMap>(
    type: TType,
    payload: TRPCMap[TType]['request'],
    options?: { targetTabId?: number; timeoutMs?: number }
  ): Promise<TRPCMap[TType]['response']> {
    const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const rpcReq: RPCRequestMessage = {
      __isRpcRequest: true,
      requestId,
      type,
      payload,
      sourceContext: this.currentContext,
    };

    let responsePromise: Promise<RPCResponseMessage<TRPCMap[TType]['response']>>;

    if (options?.targetTabId !== undefined) {
      responsePromise = UnifiedRuntime.sendTabMessage<RPCResponseMessage<TRPCMap[TType]['response']>>(
        options.targetTabId,
        rpcReq
      );
    } else {
      responsePromise = UnifiedRuntime.sendMessage<RPCResponseMessage<TRPCMap[TType]['response']>>(rpcReq);
    }

    if (options?.timeoutMs) {
      const timeoutMs = options.timeoutMs;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`RPC timeout for '${type}' after ${timeoutMs}ms`)), timeoutMs);
      });
      responsePromise = Promise.race([responsePromise, timeoutPromise]);
    }

    const response = await responsePromise;

    if (!response || !response.__isRpcResponse) {
      throw new Error(`Invalid RPC response received for '${type}'`);
    }

    if (!response.success) {
      throw new Error(response.error || `RPC request failed for '${type}'`);
    }

    return response.result as TRPCMap[TType]['response'];
  }

  /**
   * Register an RPC handler
   */
  public registerRPC<TType extends keyof TRPCMap & string, TRPCMap extends RPCProtocolMap = RPCProtocolMap>(
    type: TType,
    handler: RPCHandler<TRPCMap[TType]['request'], TRPCMap[TType]['response']>
  ): () => void {
    if (this.rpcHandlers.has(type)) {
      throw new Error(`RPC Handler for type '${type}' is already registered`);
    }

    this.rpcHandlers.set(type, handler as RPCHandler<unknown, unknown>);

    return () => {
      this.rpcHandlers.delete(type);
    };
  }

  public destroy(): void {
    if (this.cleanupRuntimeListener) {
      this.cleanupRuntimeListener();
      this.cleanupRuntimeListener = null;
    }
    this.messageHandlers.clear();
    this.rpcHandlers.clear();
  }
}
