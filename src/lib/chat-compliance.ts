/**
 * Chat Compliance — Soft moderation layer (Discord/Slack style)
 * - Word filter (DE + EN) → flag, don't block
 * - Rate control → hint after 5 messages in 10 seconds
 */

const TOXIC_WORDS_DE = [
  'hurensohn', 'wichser', 'arschloch', 'schlampe', 'missgeburt',
  'behindert', 'spasti', 'fotze', 'bastard', 'drecksau',
  'nazi', 'hure', 'schwuchtel', 'vollidiot', 'dumme sau',
];

const TOXIC_WORDS_EN = [
  'fuck you', 'motherfucker', 'asshole', 'bitch', 'retard',
  'faggot', 'nigger', 'cunt', 'dickhead', 'piece of shit',
];

const ALL_TOXIC = [...TOXIC_WORDS_DE, ...TOXIC_WORDS_EN];

/**
 * Check if message contains toxic content
 * Returns matched word or null
 */
export function detectToxicContent(content: string): string | null {
  const lower = content.toLowerCase();
  for (const word of ALL_TOXIC) {
    if (lower.includes(word)) return word;
  }
  return null;
}

/**
 * Rate limiter — tracks timestamps of recent messages
 * Returns true if rate limit exceeded (>5 in 10s)
 */
const messageTimestamps: number[] = [];
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 5;

export function checkRateLimit(): { exceeded: boolean; hint: string } {
  const now = Date.now();
  // Clean old timestamps
  while (messageTimestamps.length > 0 && now - messageTimestamps[0] > RATE_WINDOW_MS) {
    messageTimestamps.shift();
  }
  messageTimestamps.push(now);

  if (messageTimestamps.length > RATE_LIMIT) {
    return {
      exceeded: true,
      hint: 'Bitte formuliere deine Gedanken in einer zusammenhängenden Nachricht.',
    };
  }
  return { exceeded: false, hint: '' };
}

export function resetRateLimit() {
  messageTimestamps.length = 0;
}
