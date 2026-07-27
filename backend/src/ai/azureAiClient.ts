import OpenAI from "openai";
import { logger } from "../logger.js";
import type { AiClient, AzureAiConfig } from "./aiTypes.js";

const azureApiVersion = "v1";
const requestTimeoutMs = 20000;

function normalizeAzureBaseUrl(endpoint: string) {
  const trimmedEndpoint = endpoint.replace(/\/+$/, "");

  if (trimmedEndpoint.endsWith("/openai/v1")) {
    return trimmedEndpoint;
  }

  if (trimmedEndpoint.endsWith("/openai")) {
    return `${trimmedEndpoint}/v1`;
  }

  return `${trimmedEndpoint}/openai/v1`;
}

export function loadAzureAiConfig(): AzureAiConfig | null {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const missing = [
    ["AZURE_OPENAI_API_KEY", apiKey],
    ["AZURE_OPENAI_ENDPOINT", endpoint],
    ["AZURE_OPENAI_DEPLOYMENT", deployment]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    logger.warn("Azure AI assistant disabled", {
      missingVariables: missing.join(",")
    });
    return null;
  }

  return {
    apiKey: apiKey as string,
    deployment: deployment as string,
    endpoint: endpoint as string
  };
}

export function createAzureAiClient(config: AzureAiConfig): AiClient {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeAzureBaseUrl(config.endpoint),
    defaultQuery: { "api-version": azureApiVersion },
    maxRetries: 1,
    timeout: requestTimeoutMs
  });

  return {
    async createResponse(input, signal) {
      const response = await client.responses.create(
        {
          input,
          max_output_tokens: 900,
          model: config.deployment,
          store: false
        },
        { signal }
      );

      return response.output_text?.trim() ?? "";
    }
  };
}
