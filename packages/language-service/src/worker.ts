import {
  compileChemdForEditor,
  type ChemdLanguageServiceDependencies
} from "./compile";
import type {
  ChemdLanguageCompileInput,
  ChemdLanguageCompileOutput
} from "./types";

export interface ChemdLanguageCompileRequest {
  requestId: string;
  type: "compile";
  payload: ChemdLanguageCompileInput;
}

export interface ChemdLanguageCompileRequestState {
  latestRequestId?: string;
  isCurrentRequest?: (requestId: string) => boolean;
}

interface ChemdLanguageCompileResponseBase {
  requestId: string;
  type: "compile";
}

export interface ChemdLanguageCompileOkResponse
  extends ChemdLanguageCompileResponseBase {
  status: "ok";
  payload: Extract<ChemdLanguageCompileOutput, { status: "ok" }>;
}

export interface ChemdLanguageCompileErrorResponse
  extends ChemdLanguageCompileResponseBase {
  status: "error";
  payload: Extract<ChemdLanguageCompileOutput, { status: "failed" }>;
  error: Extract<ChemdLanguageCompileOutput, { status: "failed" }>["error"];
}

export interface ChemdLanguageCompileStaleResponse
  extends ChemdLanguageCompileResponseBase {
  status: "stale";
  stale: true;
}

export type ChemdLanguageCompileResponse =
  | ChemdLanguageCompileOkResponse
  | ChemdLanguageCompileErrorResponse
  | ChemdLanguageCompileStaleResponse;

const isStaleCompileRequest = (
  requestId: string,
  state: ChemdLanguageCompileRequestState
): boolean => {
  if (state.latestRequestId && state.latestRequestId !== requestId) {
    return true;
  }

  return state.isCurrentRequest ? !state.isCurrentRequest(requestId) : false;
};

export const createStaleCompileResponse = (
  requestId: string
): ChemdLanguageCompileStaleResponse => ({
  requestId,
  type: "compile",
  status: "stale",
  stale: true
});

export const compileChemdLanguageServiceRequest = (
  request: ChemdLanguageCompileRequest,
  dependencies: ChemdLanguageServiceDependencies = {},
  state: ChemdLanguageCompileRequestState = {}
): ChemdLanguageCompileResponse => {
  if (isStaleCompileRequest(request.requestId, state)) {
    return createStaleCompileResponse(request.requestId);
  }

  const payload = compileChemdForEditor(request.payload, dependencies);

  if (isStaleCompileRequest(request.requestId, state)) {
    return createStaleCompileResponse(request.requestId);
  }

  if (payload.status === "failed") {
    return {
      requestId: request.requestId,
      type: "compile",
      status: "error",
      payload,
      error: payload.error
    };
  }

  return {
    requestId: request.requestId,
    type: "compile",
    status: "ok",
    payload
  };
};
