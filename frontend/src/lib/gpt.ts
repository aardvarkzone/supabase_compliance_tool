import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const getOpenAIClient = () => {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured. Please set NEXT_PUBLIC_OPENAI_API_KEY in your .env.local file');
    }
    return new OpenAI({ 
      apiKey,
      dangerouslyAllowBrowser: true
    });
};

const openai = getOpenAIClient();

const DEFAULT_MODEL = 'gpt-4';
const DEFAULT_ERROR_MESSAGE = 'An error occurred while communicating with OpenAI.';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatResponse {
  content: string;
  details?: {
    model: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const SUPABASE_SYSTEM_PROMPT = `You are a specialized Supabase assistant with expertise in database security, compliance, and best practices. Your role is to help users understand and implement security measures in their Supabase projects.

Key areas of focus:
- Security best practices for Supabase projects
- Row Level Security (RLS) policies and implementation
- Authentication and authorization patterns
- Database backups and Point-in-Time Recovery (PITR)
- Multi-factor authentication (MFA) setup
- API security and key management
- Data privacy and compliance requirements
- Performance optimization and monitoring
- Common security pitfalls and how to avoid them

When providing assistance:
1. Always emphasize security best practices
2. Explain the reasoning behind recommendations
3. Provide code examples when relevant
4. Highlight potential security implications
5. Reference official Supabase documentation when applicable
6. Consider compliance requirements (GDPR, HIPAA, etc.)

Maintain a professional, security-focused approach while being helpful and clear in your explanations.`;

export class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: any
  ) {
    super(message);
    this.name = 'OpenAIError';
  }
}

export const getChatCompletion = async (
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResponse> => {
  try {
    const systemPromptExists = messages.some(msg => 
      msg.role === 'system' && msg.content.includes('Supabase assistant'));
    
    const finalMessages = systemPromptExists 
      ? messages 
      : [createSystemMessage(SUPABASE_SYSTEM_PROMPT), ...messages];

    const response = await openai.chat.completions.create({
      model: options.model || DEFAULT_MODEL,
      messages: finalMessages as ChatCompletionMessageParam[],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    });

    const completion = response.choices[0]?.message;
    
    if (!completion) {
      throw new OpenAIError('No completion received from OpenAI');
    }

    return {
      content: completion.content || '',
      details: {
        model: response.model,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      },
    };
  } catch (error: any) {
    if (error instanceof OpenAIError) {
      throw error;
    }

    const message = error.response?.data?.error?.message || error.message || DEFAULT_ERROR_MESSAGE;
    const statusCode = error.response?.status;
    
    throw new OpenAIError(message, statusCode, error);
  }
};

export const getStreamingChatCompletion = async (
  messages: ChatMessage[],
  onMessage: (message: string) => void,
  options: ChatOptions = {}
): Promise<void> => {
  try {
    const systemPromptExists = messages.some(msg => 
      msg.role === 'system' && msg.content.includes('Supabase assistant'));
    
    const finalMessages = systemPromptExists 
      ? messages 
      : [createSystemMessage(SUPABASE_SYSTEM_PROMPT), ...messages];

    const stream = await openai.chat.completions.create({
      model: options.model || DEFAULT_MODEL,
      messages: finalMessages as ChatCompletionMessageParam[],
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        onMessage(delta);
      }
    }
  } catch (error: any) {
    const message = error.response?.data?.error?.message || error.message || DEFAULT_ERROR_MESSAGE;
    const statusCode = error.response?.status;
    
    throw new OpenAIError(message, statusCode, error);
  }
};

export const createSupabaseQuestion = (
  topic: 'security' | 'rls' | 'auth' | 'performance' | 'general',
  question: string
): ChatMessage => {
   return createUserMessage(question);
};

export const createMessage = (role: ChatRole, content: string): ChatMessage => ({
  role,
  content: content.trim(),
});

export const createSystemMessage = (content: string): ChatMessage => 
  createMessage('system', content);

export const createUserMessage = (content: string): ChatMessage => 
  createMessage('user', content);

export const createAssistantMessage = (content: string): ChatMessage => 
  createMessage('assistant', content);