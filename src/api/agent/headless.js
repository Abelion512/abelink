"use strict";

const { spawn } = require("child_process");
const path = require("path");

// Helper to spawn sidecar engine via bun and send request
async function sidecarRpc(toolName, args) {
  const request = JSON.stringify({
    id: Date.now() % 1000000,
    action: "native-tool:execute",
    payload: [toolName, args, {}],
  }) + "\n";

  return new Promise((resolve, reject) => {
    let buf = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Sidecar timeout >5 min"));
    }, 300000);

    const child = spawn("bun", ["sidecar/engine.mjs"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, MARK_DEBUG_AI: "0" },
    });

    child.stdin.write(request);
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
    });

    child.stdout.on("end", () => {
      clearTimeout(timeout);
      for (const line of buf.split("\n")) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.id === request.id) {
            clearTimeout(timeout);
            resolve(obj);
            return;
          }
        } catch (e) {
          continue;
        }
      }
      reject(new Error("No JSON response from sidecar"));
    });
  });
}

// Helper to parse tool calls from LLM text
function parseToolCalls(text) {
  const calls = [];
  const regex = /\[tool:\s*(\S+)\(([^)]*)\)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const argsStr = match[2];
    const args = {};
    const pairRegex = /(\w+)=([^,]*?)(?=,|$)/g;
    let pairMatch;
    while ((pairMatch = pairRegex.exec(argsStr)) !== null) {
      const v = pairMatch[2].trim();
      args[pairMatch[1].trim()] =
        v === "true"
          ? true
          : v === "false"
            ? false
            : !isNaN(v)
              ? Number(v)
              : v.replace(/^"|"$/g, "");
    }
    calls.push({ name, arguments: args });
  }
  return calls;
}

// Main headless agent function
async function runHeadlessAgent(prompt, config = {}) {
  const messages = [{ role: "user", content: prompt }];
  let steps = 0;
  let toolCalls = 0;
  let noProgressStreak = 0;
  const stepLog = [];

  const MAX_STEPS = 25;
  const MAX_NO_PROGRESS = 3;

  while (steps < MAX_STEPS && noProgressStreak < MAX_NO_PROGRESS) {
    steps++;

    // Get next action from planning module
    let actionResult;
    try {
      const { getNextAction } = require("./ai/planning");
      actionResult = await getNextAction(messages, config);
    } catch (err) {
      console.error("getNextAction failed:", err);
      noProgressStreak++;
      continue;
    }

    if (!actionResult) {
      noProgressStreak++;
      continue;
    }

    stepLog.push({
      type: "planning",
      step: steps,
      data: actionResult,
    });

    const { type, content, toolCall } = actionResult;

    if (type === "final" || !content) {
      const response = content || "";
      messages.push({ role: "assistant", content: response });
      break;
    }

    if (type === "tool_call" && toolCall) {
      const { name, arguments: toolArgs } = toolCall;

      // Check if tool exists
      let toolExists;
      try {
        const { checkTools } = require("./tools/core-tools");
        toolExists = checkTools(name);
      } catch (err) {
        console.error("checkTools failed:", err);
        toolExists = false;
      }
      if (!toolExists) {
        stepLog.push({
          type: "error",
          step: steps,
          data: `Tool ${name} not found`,
        });
        noProgressStreak++;
        continue;
      }

      // Execute tool via sidecar
      let toolResult;
      try {
        toolResult = await sidecarRpc(name, toolArgs);
        stepLog.push({
          type: "tool_execution",
          step: steps,
          tool: name,
          result: toolResult,
        });
        messages.push({
          role: "tool",
          content: toolResult,
          toolName: name,
        });
        toolCalls++;
        noProgressStreak = 0;
      } catch (err) {
        console.error(`Tool execution error for ${name}:`, err);
        stepLog.push({
          type: "error",
          step: steps,
          data: err.message || "Tool execution failed",
        });
        noProgressStreak++;
      }
    } else {
      stepLog.push({
        type: "error",
        step: steps,
        data: `Unknown action type: ${type} or missing content`,
      });
      noProgressStreak++;
    }
  }

  // Extract final response
  const response = messages[messages.length - 1]?.content || "";

  return {
    response: response.trim(),
    trajectory: {
      steps,
      toolCalls,
      stepLog,
    },
    tokenUsage: {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimated: false,
    },
  };
}

module.exports = {
  runHeadlessAgent,
};