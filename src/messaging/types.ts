/**
 * Messaging Bridge Types
 * Cross-browser MV3 typed message schemas, channels, and RPC interfaces.
 */

export type ContextType = 'background' | 'content-script' | 'sidepanel' | 'popup' | 'devtools';

export interface BaseMessage<TType extends string = string, TPayload = unknown> {
  id?: string;
  type: TType;
  payload: TPayload;
  timestamp?: number;
  sourceContext?: ContextType;
}

// Request-Response message envelope
export interface RPCRequestMessage<TType extends string = string, TPayload = unknown> {
  __isRpcRequest: true;
  requestId: string;
  type: TType;
  payload: TPayload;
  sourceContext?: ContextType;
}

export interface RPCResponseMessage<TResult = unknown> {
  __isRpcResponse: true;
  requestId: string;
  success: boolean;
  result?: TResult;
  error?: string;
}

// Stream chunk envelope for long-lived channels
export type StreamEventType = 'chunk' | 'error' | 'complete';

export interface StreamEventMessage<TChunk = unknown> {
  __isStreamEvent: true;
  streamId: string;
  event: StreamEventType;
  data?: TChunk;
  error?: string;
}

export interface PortMessageEnvelope {
  type: string;
  payload: unknown;
  id?: string;
  streamId?: string;
}

// Protocol maps (extensible by applications)
export interface MessageProtocolMap {
  [key: string]: unknown;
}

export interface RPCProtocolMap {
  [key: string]: {
    request: unknown;
    response: unknown;
  };
}

export interface StreamProtocolMap {
  [key: string]: {
    init: unknown;
    chunk: unknown;
  };
}
