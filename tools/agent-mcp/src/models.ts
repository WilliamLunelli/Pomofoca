import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ModelSpec } from './config.js';

function requireEnv(name: string): void {
  if (!process.env[name]) {
    throw new Error(
      `Variável de ambiente ${name} não definida (necessária para este papel).`,
    );
  }
}

/** Camada única de provedores: para adicionar outro (OpenAI, etc.), é só mais um `case`. */
export function resolveModel(spec: ModelSpec): LanguageModel {
  switch (spec.provider) {
    case 'anthropic':
      requireEnv('ANTHROPIC_API_KEY');
      return anthropic(spec.model);
    case 'google':
      requireEnv('GOOGLE_GENERATIVE_AI_API_KEY');
      return google(spec.model);
    case 'claude-cli':
    case 'gemini-cli':
      // Provedores de CLI não passam pelo AI SDK: delegate.ts usa cli-runner.ts.
      throw new Error(`O provedor ${spec.provider} roda via CLI, não via AI SDK.`);
  }
}
