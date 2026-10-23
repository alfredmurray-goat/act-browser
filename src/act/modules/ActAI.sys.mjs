/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Chat client for Groq (or anything else that speaks the OpenAI chat
// completions API). Responses are streamed.
//
// The API key is kept in Firefox's password manager, so it's encrypted along
// with the user's other passwords and shows up in about:logins.

import { ActPrefs } from "resource://act/ActPrefs.sys.mjs";

const KEY_REALM = "Act Browser AI key";
const KEY_USER = "api-key";

export class AIError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "AIError";
    this.status = status;
  }
}

function endpoint() {
  return ActPrefs.aiEndpoint.replace(/\/+$/, "");
}

function keyOrigin() {
  try {
    return new URL(endpoint()).origin;
  } catch {
    return "https://api.groq.com";
  }
}

async function readError(response) {
  let message = `${response.status} ${response.statusText}`;
  try {
    let body = await response.json();
    message = body?.error?.message || message;
  } catch {}
  if (response.status == 401) {
    message = "The API key was rejected. Check it in Act settings.";
  } else if (response.status == 429) {
    message = "Rate limited by the AI provider, try again in a moment.";
  }
  return new AIError(message, response.status);
}

export const ActAI = {
  get enabled() {
    return ActPrefs.aiEnabled;
  },

  get model() {
    return ActPrefs.aiModel;
  },

  async getApiKey() {
    try {
      let logins = await Services.logins.searchLoginsAsync({
        origin: keyOrigin(),
        httpRealm: KEY_REALM,
      });
      if (logins.length) {
        return logins[0].password;
      }
    } catch (e) {
      // The primary password prompt was cancelled, most likely.
      console.warn("Act: couldn't read the AI key", e);
    }
    // Handy for development: GROQ_API_KEY=... npm run dev
    return Services.env.get("GROQ_API_KEY") || "";
  },

  async hasApiKey() {
    return !!(await this.getApiKey());
  },

  async setApiKey(key) {
    key = (key || "").trim();
    let origin = keyOrigin();
    let existing = await Services.logins.searchLoginsAsync({
      origin,
      httpRealm: KEY_REALM,
    });
    for (let login of existing) {
      await Services.logins.removeLoginAsync(login);
    }
    if (!key) {
      return;
    }
    let login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
      Ci.nsILoginInfo
    );
    login.init(origin, null, KEY_REALM, KEY_USER, key, "", "");
    await Services.logins.addLoginAsync(login);
  },

  async listModels() {
    let key = await this.getApiKey();
    let response = await fetch(`${endpoint()}/models`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      credentials: "omit",
    });
    if (!response.ok) {
      throw await readError(response);
    }
    let body = await response.json();
    return (body.data || [])
      .filter(m => m.active !== false)
      .map(m => m.id)
      .filter(id => !/whisper|tts|guard|embed/i.test(id))
      .sort();
  },

  /**
   * One streamed chat completion.
   *
   * @param {object} params
   * @param {Array} params.messages OpenAI style messages
   * @param {Array} [params.tools] OpenAI style function tools
   * @param {AbortSignal} [params.signal]
   * @param {Function} [params.onText] called with each text delta
   * @param {Function} [params.onReasoning] called while the model is reasoning
   * @returns {Promise<{content: string, toolCalls: Array, finishReason: string}>}
   */
  async chat({ messages, tools, signal, onText, onReasoning }) {
    if (!this.enabled) {
      throw new AIError("AI is turned off");
    }
    let key = await this.getApiKey();
    let local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(endpoint());
    if (!key && !local) {
      throw new AIError("Add your Groq API key in Act settings to start.", 401);
    }

    let body = {
      model: this.model,
      messages,
      stream: true,
      temperature: parseFloat(ActPrefs.aiTemperature) || 0.4,
    };
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    let headers = { "content-type": "application/json" };
    if (key) {
      headers.authorization = `Bearer ${key}`;
    }

    let response = await fetch(`${endpoint()}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
      credentials: "omit",
    });
    if (!response.ok) {
      throw await readError(response);
    }

    let content = "";
    let finishReason = "";
    let calls = [];

    let handle = chunk => {
      let choice = chunk.choices?.[0];
      if (!choice) {
        if (chunk.error) {
          throw new AIError(chunk.error.message || "Stream error");
        }
        return;
      }
      let delta = choice.delta || {};
      if (delta.reasoning || delta.reasoning_content) {
        onReasoning?.(delta.reasoning || delta.reasoning_content);
      }
      if (delta.content) {
        content += delta.content;
        onText?.(delta.content);
      }
      for (let call of delta.tool_calls || []) {
        let i = call.index ?? calls.length;
        calls[i] ??= { id: "", name: "", arguments: "" };
        if (call.id) {
          calls[i].id = call.id;
        }
        if (call.function?.name) {
          calls[i].name += call.function.name;
        }
        if (call.function?.arguments) {
          calls[i].arguments += call.function.arguments;
        }
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    };

    let reader = response.body.getReader();
    let decoder = new TextDecoder();
    let buffer = "";
    let done = false;
    while (!done) {
      let { value, done: streamDone } = await reader.read();
      if (streamDone) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let lines = buffer.split("\n");
      buffer = lines.pop();
      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith("data:")) {
          continue;
        }
        let data = line.slice(5).trim();
        if (data == "[DONE]") {
          done = true;
          break;
        }
        try {
          handle(JSON.parse(data));
        } catch (e) {
          if (e instanceof AIError) {
            throw e;
          }
          // Ignore keep-alives and half lines.
        }
      }
    }

    return {
      content,
      finishReason,
      toolCalls: calls.filter(Boolean).map((c, i) => ({
        id: c.id || `call_${i}`,
        name: c.name,
        arguments: c.arguments,
      })),
    };
  },
};
