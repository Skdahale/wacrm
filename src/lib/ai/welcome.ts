/**
 * Utilities for extracting and managing AI welcome messages.
 *
 * Supports:
 *   1. Dedicated `[WELCOME_MESSAGE]...[/WELCOME_MESSAGE]` tags embedded in system_prompt
 *   2. Existing prompts containing `WELCOME MESSAGE: ... Example: "..."`
 *   3. Simple `WELCOME MESSAGE:\n...` sections
 *   4. Explicit configured welcomeMessage string
 */

export const DEFAULT_WELCOME_MESSAGE =
  'Hello! 👋 Welcome. How can I help you today?';

/**
 * Extract a welcome message from the system prompt or return null if none found.
 */
export function extractWelcomeMessage(prompt: string | null | undefined): string | null {
  if (!prompt || typeof prompt !== 'string') return null;

  // 1. Explicit tag: [WELCOME_MESSAGE] ... [/WELCOME_MESSAGE]
  const tagged = prompt.match(/\[WELCOME_MESSAGE\]([\s\S]*?)\[\/WELCOME_MESSAGE\]/);
  if (tagged && tagged[1].trim()) {
    return tagged[1].trim();
  }

  // 2. Pattern: WELCOME MESSAGE: ... Example: "..."
  const exampleMatch = prompt.match(/WELCOME MESSAGE:[\s\S]*?Example:\s*"([\s\S]*?)"/i);
  if (exampleMatch && exampleMatch[1].trim()) {
    return exampleMatch[1].trim();
  }

  // 3. Pattern: WELCOME MESSAGE:\n ... (until next capitalized heading or end)
  const headingMatch = prompt.match(/WELCOME MESSAGE:\s*\n+([\s\S]*?)(?=\n\n[A-Z\s]{4,}:|$)/i);
  if (headingMatch && headingMatch[1].trim()) {
    const raw = headingMatch[1].trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      return raw.slice(1, -1).trim();
    }
    return raw;
  }

  return null;
}

/**
 * Embed or update a welcome message inside the system prompt string.
 */
export function embedWelcomeMessage(
  prompt: string | null | undefined,
  welcomeMessage: string | null | undefined,
): string | null {
  const current = (prompt ?? '').trim();
  const nextMsg = (welcomeMessage ?? '').trim();

  // If no welcome message provided, strip existing tags if any
  if (!nextMsg) {
    const stripped = current.replace(/\[WELCOME_MESSAGE\][\s\S]*?\[\/WELCOME_MESSAGE\]\n*/g, '').trim();
    return stripped || null;
  }

  // If prompt already has [WELCOME_MESSAGE] ... [/WELCOME_MESSAGE], replace it
  if (/\[WELCOME_MESSAGE\][\s\S]*?\[\/WELCOME_MESSAGE\]/.test(current)) {
    return current.replace(
      /\[WELCOME_MESSAGE\][\s\S]*?\[\/WELCOME_MESSAGE\]/,
      `[WELCOME_MESSAGE]\n${nextMsg}\n[/WELCOME_MESSAGE]`,
    );
  }

  // If prompt has WELCOME MESSAGE: ... Example: "...", replace that block
  if (/WELCOME MESSAGE:[\s\S]*?Example:\s*"[\s\S]*?"/i.test(current)) {
    return current.replace(
      /WELCOME MESSAGE:[\s\S]*?Example:\s*"[\s\S]*?"/i,
      `WELCOME MESSAGE:\n[WELCOME_MESSAGE]\n${nextMsg}\n[/WELCOME_MESSAGE]`,
    );
  }

  // Otherwise append at the end
  const block = `\n\n[WELCOME_MESSAGE]\n${nextMsg}\n[/WELCOME_MESSAGE]`;
  return current ? `${current}${block}` : `[WELCOME_MESSAGE]\n${nextMsg}\n[/WELCOME_MESSAGE]`;
}

/**
 * Strip the welcome message tag from system prompt when feeding to LLM,
 * so the LLM prompt is clean and doesn't waste tokens.
 */
export function stripWelcomeMessage(prompt: string | null | undefined): string | null {
  if (!prompt) return null;
  const cleaned = prompt
    .replace(/\[WELCOME_MESSAGE\][\s\S]*?\[\/WELCOME_MESSAGE\]\n*/g, '')
    .trim();
  return cleaned || null;
}
