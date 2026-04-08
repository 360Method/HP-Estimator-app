/**
 * Server-Sent Events (SSE) manager for real-time inbox updates.
 * Clients connect to GET /api/inbox/events and receive push notifications
 * when new messages arrive (inbound SMS, email, calls).
 */

import type { Response } from "express";

interface SSEClient {
  id: string;
  res: Response;
}

const clients = new Map<string, SSEClient>();

/** Register a new SSE client */
export function addSSEClient(id: string, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Send initial ping
  res.write(`event: connected\ndata: {"clientId":"${id}"}\n\n`);

  clients.set(id, { id, res });

  // Heartbeat every 25s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(id);
    }
  }, 25000);

  // Clean up on disconnect
  res.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(id);
    console.log(`[SSE] Client ${id} disconnected`);
  });

  console.log(`[SSE] Client ${id} connected (total: ${clients.size})`);
}

/** Broadcast an event to all connected clients */
export function broadcastSSE(event: string, data: unknown) {
  const payload = JSON.stringify(data);
  const dead: string[] = [];

  for (const [id, client] of clients) {
    try {
      client.res.write(`event: ${event}\ndata: ${payload}\n\n`);
    } catch {
      dead.push(id);
    }
  }

  // Remove dead clients
  dead.forEach(id => clients.delete(id));
}

/** Broadcast a new message event */
export function broadcastNewMessage(conversationId: number, message: unknown) {
  broadcastSSE("new_message", { conversationId, message });
}

/** Broadcast a new conversation event */
export function broadcastNewConversation(conversation: unknown) {
  broadcastSSE("new_conversation", { conversation });
}
