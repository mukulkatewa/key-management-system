import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Simple API Key authentication middleware
 * In production, use JWT or OAuth2 instead
 */
export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string;
  
  // In production, store API keys in environment variable or database
  const validApiKey = process.env.API_KEY;
  
  if (!validApiKey) {
    // If no API key is configured, skip auth in development
    if (process.env.NODE_ENV === 'production') {
      return reply.code(500).send({ error: 'API authentication not configured' });
    }
    return; // Skip auth in development
  }
  
  if (!apiKey || apiKey !== validApiKey) {
    return reply.code(401).send({ error: 'Unauthorized: Invalid API key' });
  }
}
