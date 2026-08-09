import OpenAI from "openai";
import { logger } from "../logger.js";
import type { AiClient, AzureAiConfig } from "./aiTypes.js";

const requestTimeoutMs = 20000;
const allowedReasoningEfforts = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
] as const;

type ReasoningEffort = (typeof allowedReasoningEfforts)[number];

function getPositiveNumber(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function getReasoningEffort(): ReasoningEffort {
  const effort = process.env.AI_REASONING_EFFORT;
  const allowedEfforts = new Set<string>(allowedReasoningEfforts);

  return allowedEfforts.has(effort ?? "")
    ? (effort as ReasoningEffort)
    : "minimal";
}

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

export function extractResponseText(response: unknown) {
  if (!response || typeof response !== "object") {
    return "";
  }

  const responseBody = response as {
    output?: Array<{
      content?: Array<{
        text?: string;
        type?: string;
      }>;
    }>;
    output_text?: string;
  };

  const directText = responseBody.output_text?.trim();

  if (directText) {
    return directText;
  }

  return (
    responseBody.output
      ?.flatMap((outputItem) => outputItem.content ?? [])
      .map((contentItem) => contentItem.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n") ?? ""
  );
}

function summarizeResponse(response: unknown) {
  if (!response || typeof response !== "object") {
    return {
      hasOutputText: false,
      outputItemTypes: "",
      status: "unknown"
    };
  }

  const responseBody = response as {
    error?: { code?: string | null; message?: string | null } | null;
    incomplete_details?: { reason?: string | null } | null;
    output?: Array<{
      content?: Array<{ refusal?: string; text?: string; type?: string }>;
      status?: string;
      type?: string;
    }>;
    output_text?: string;
    status?: string;
  };

  const outputItemTypes =
    responseBody.output
      ?.map((item) => {
        const contentTypes =
          item.content?.map((contentItem) => contentItem.type).join("+") ??
          "no-content";

        return `${item.type ?? "unknown"}:${item.status ?? "unknown"}:${contentTypes}`;
      })
      .join(",") ?? "";

  return {
    errorCode: responseBody.error?.code ?? undefined,
    hasOutputText: Boolean(responseBody.output_text?.trim()),
    incompleteReason: responseBody.incomplete_details?.reason ?? undefined,
    outputItemTypes,
    status: responseBody.status ?? "unknown"
  };
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
    maxRetries: 1,
    timeout: requestTimeoutMs
  });

  return {
    async createResponse(input, signal) {
      const response = await client.responses.create(
        {
          input,
          max_output_tokens: getPositiveNumber(
            process.env.AI_MAX_OUTPUT_TOKENS,
            900
          ),
          model: config.deployment,
          reasoning: {
            effort: getReasoningEffort()
          },
          store: false,
          text: {
            verbosity: "low"
          }
        },
        { signal }
      );

      const text = extractResponseText(response);

      if (!text) {
        logger.warn("Azure AI response had no visible text", summarizeResponse(response));
      }

      return text;
    }
  };
}
