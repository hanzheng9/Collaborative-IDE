import type {
  ExecutionProviderRequest,
  ExecutionResult
} from "./executionTypes.js";

export interface ExecutionProvider {
  run(request: ExecutionProviderRequest, signal?: AbortSignal): Promise<ExecutionResult>;
}
