import { RateLimitPluginOptions } from '@fastify/rate-limit';

export const rateLimitConfig: RateLimitPluginOptions = {
  global: true,
  max: 100, // Maximum 100 requests
  timeWindow: '5 minutes', // Per 5 minute window
  cache: 10000, // Cache size
  allowList: ['127.0.0.1'], // Whitelist localhost for testing
  skipOnError: false, // Don't skip on errors
  
  // Custom error response
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. You can make ${context.max} requests per ${context.after}. Please try again later.`,
      retryAfter: context.after
    };
  },
  
  // Custom key generator (group by IP + API key)
  keyGenerator: (request) => {
    const apiKey = request.headers['x-api-key'] || 'anonymous';
    const ip = request.ip;
    return `${ip}-${apiKey}`;
  }
};

// For wallet generation (more restrictive)
export const walletGenerationRateLimit: RateLimitPluginOptions = {
  max: 5, // Only 5 wallet generations
  timeWindow: '5 minutes', // Per 5 minutes
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Wallet generation limit: ${context.max} wallets per ${context.after}.`,
      retryAfter: context.after
    };
  }
};

// For signing operations (moderate)
export const signingRateLimit: RateLimitPluginOptions = {
  max: 50, // 50 signatures
  timeWindow: '5 minutes', // Per 5 minutes
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Signing limit: ${context.max} signatures per ${context.after}.`,
      retryAfter: context.after
    };
  }
};

// For MPC wallet generation (very strict)
export const mpcWalletGenerationRateLimit: RateLimitPluginOptions = {
  max: 3, // Only 3 MPC wallets
  timeWindow: '5 minutes', // Per 5 minutes
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `MPC wallet generation limit: ${context.max} wallets per ${context.after}. MPC wallets require more resources.`,
      retryAfter: context.after
    };
  }
};

// For read operations (lenient)
export const readOperationsRateLimit: RateLimitPluginOptions = {
  max: 200, // 200 reads
  timeWindow: '5 minutes', // Per 5 minutes
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Read operation limit: ${context.max} requests per ${context.after}.`,
      retryAfter: context.after
    };
  }
};

// For health checks (very lenient)
export const healthCheckRateLimit: RateLimitPluginOptions = {
  max: 1000, // 1000 health checks
  timeWindow: '5 minutes', // Per 5 minutes
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Even health checks have limits: ${context.max} per ${context.after}.`,
      retryAfter: context.after
    };
  }
};
