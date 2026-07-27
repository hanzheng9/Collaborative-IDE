import OpenAI from "openai";
import { createHash } from "node:crypto";
import { logger } from "../logger.js";
import { buildAiPrompt } from "./aiPrompts.js";
import { createAzureAiClient, loadAzureAiConfig } from "./azureAiClient.js";
import {
  AiServiceError,
  type AiAssistRequest,
  type AiAssistResponse,
  type AiClient
} from "./aiTypes.js";

type AiServiceOptions = {
  client?: AiClient;
};

export class AiService {
  private readonly client: AiClient | null;
  private readonly pendingRequests = new Map<string, Promise<AiAssistResponse>>();

  constructor(options: AiServiceOptions = {}) {
    if (options.client) {
      this.client = options.client;
      return;
    }

    const config = loadAzureAiConfig();
    this.client = config ? createAzureAiClient(config) : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async assist(
    request: AiAssistRequest,
    signal?: AbortSignal
  ): Promise<AiAssistResponse> {
    if (!this.client) {
      throw new AiServiceError("AI assistant is not configured.", 503);
    }

    const requestKey = this.getRequestKey(request);
    const pendingRequest = this.pendingRequests.get(requestKey);

    if (pendingRequest) {
      return pendingRequest;
    }

    const startedAt = Date.now();
    const promise = this.runAssistantRequest(request, signal, startedAt).finally(() => {
      this.pendingRequests.delete(requestKey);
    });
    this.pendingRequests.set(requestKey, promise);
    return promise;
  }

  private async runAssistantRequest(
    request: AiAssistRequest,
    signal: AbortSignal | undefined,
    startedAt: number
  ): Promise<AiAssistResponse> {
    try {
      const result = (await this.client?.createResponse(
        buildAiPrompt(request),
        signal
      ))?.trim();

      if (!result) {
        throw new AiServiceError("AI returned an empty response.", 502);
      }

      logger.info("AI request succeeded", {
        action: request.action,
        durationMs: Date.now() - startedAt
      });

      return {
        action: request.action,
        result
      };
    } catch (error) {
      if (error instanceof AiServiceError) {
        logger.warn("AI request failed", {
          action: request.action,
          durationMs: Date.now() - startedAt,
          statusCode: error.statusCode
        });
        throw error;
      }

      const statusCode = this.getStatusCode(error);
      logger.warn("AI provider request failed", {
        action: request.action,
        durationMs: Date.now() - startedAt,
        statusCode
      });

      throw new AiServiceError(
        statusCode === 429
          ? "AI request limit reached. Try again shortly."
          : "AI assistant is temporarily unavailable.",
        statusCode === 429 ? 429 : 503
      );
    }
  }

  private getRequestKey(request: AiAssistRequest) {
    return createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
  }

  private getStatusCode(error: unknown) {
    if (error instanceof OpenAI.APIError && error.status) {
      if (error.status === 429) {
        return 429;
      }

      if (error.status >= 500) {
        return 503;
      }
    }

    return 503;
  }
}
