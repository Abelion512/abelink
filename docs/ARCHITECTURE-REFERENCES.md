# Architecture References — Agent Memory, Checkpoint, Steering, Approval

## Research Sources

| Framework | Source | Focus |
|-----------|--------|-------|
| Claude Code | https://code.claude.com/docs/en/ | Permission modes, memory, subagents |
| LangGraph | https://docs.langchain.com/oss/python/langgraph/ | Checkpointer, interrupt, store |
| AutoGen | https://github.com/microsoft/autogen | Pluggable memory, multi-agent |
| CrewAI | https://docs.crewai.com/ | Unified memory, composite scoring |

---

## 1. Agent Loop Patterns

### Claude Code (Source: https://code.claude.com/docs/en/how-claude-code-works)

> "When given a task, Claude Code operates in an agentic loop consisting of three phases: gather context, take action, and verify results. These phases are iterative and Claude utilizes tools throughout the process to understand code, make changes, and check its work. The loop adapts to the task, and users can interrupt at any point to provide input or steer Claude."

**Key features:**
- 3-phase loop: gather → act → verify
- User can interrupt anytime
- Configurable max turns via `--max-turns`
- Tool execution based on permission mode

### LangGraph (Source: https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph)

```python
# Persistent loop with checkpoint at each super-step
stream = graph.stream_events(input, config, version="v3")
for snapshot in stream.values:
    # State saved automatically via checkpointer
    pass
# Can resume from any checkpoint
resumed = graph.stream_events(Command(resume=value), config, version="v3")
```

**Key features:**
- Checkpoint at each super-step
- Thread-based state management
- Interrupt/resume pattern
- Durable execution

### AutoGen (Source: https://github.com/microsoft/autogen)

```python
agent = AssistantAgent(
    name="assistant",
    model_client=model_client,
    memory=[memory],  # Pluggable memory backends
    system_message="...",
)
result = await agent.run(task="...")
# Memory persists across runs
```

**Key features:**
- Pluggable memory backends
- Task-centric memory retrieval
- Multi-agent coordination

### CrewAI (Source: https://docs.crewai.com/concepts/flows)

```python
class ResearchFlow(Flow):
    @start()
    def gather_data(self):
        findings = "..."
        self.remember(findings, scope="/research/databases")
    
    @listen(gather_data)
    def analyze(self):
        past = self.recall("database performance", limit=10)
```

**Key features:**
- Flow-based orchestration
- Scope-based memory organization
- Composite scoring (semantic + recency + importance)

---

## 2. Checkpoint / Persistence Patterns

### LangGraph Checkpointer (Source: https://docs.langchain.com/oss/python/langgraph/checkpointers)

```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()
graph = builder.compile(checkpointer=checkpointer)

# Thread ID = pointer to specific conversation state
config = {"configurable": {"thread_id": "thread-1"}}
graph.invoke(input, config)

# Resume from checkpoint
resumed = graph.invoke(Command(resume=value), config)
```

**Key pattern:** Checkpointer saves full graph state at each super-step, organized by thread ID.

### LangGraph interrupt() (Source: https://docs.langchain.com/oss/python/langgraph/interrupts)

```python
from langgraph.types import interrupt, Command

def approval_node(state):
    # PAUSE — save state via checkpointer
    approved = interrupt("Do you approve this action?")
    # RESUME — value from Command(resume=...)
    if approved:
        return {"action": "proceed"}
    else:
        return {"action": "cancel"}

# Usage
graph.stream_events(input, config, version="v3")
# stream.interrupted = True when paused
# stream.interrupts = [Interrupt(value='...')]
# Resume
graph.stream_events(Command(resume=True), config, version="v3")
```

**Key pattern:** Dynamic interrupts placed anywhere in code, conditional on application logic.

### Claude Code Subagent Memory (Source: https://code.claude.com/docs/en/claude-directory)

```yaml
# Subagent with persistent memory
---
name: code-reviewer
description: Reviews code for quality
memory: user  # or "project"
---
# Stored at: .claude/agent-memory/<agent-name>/MEMORY.md
# Survives across conversations
```

**Key pattern:** Separate memory directories per subagent, scoped to user or project.

---

## 3. Steering / Intervention Patterns

### Claude Code (Source: https://code.claude.com/docs/en/how-claude-code-works)

> "The loop adapts to the task, and users can interrupt at any point to provide input or steer Claude."

**Key pattern:** Real-time steering during execution.

### LangGraph interrupt + resume (Source: https://docs.langchain.com/oss/python/langgraph/interrupts)

```python
# User reviews and edits state before continuing
def review_node(state):
    edited_content = interrupt({
        "instruction": "Review and edit this content",
        "content": state["generated_text"]
    })
    return {"generated_text": edited_content}

# Resume with edited content
graph.stream_events(
    Command(resume="The edited and improved text"),
    config=config,
    version="v3",
)
```

**Key pattern:** Interrupt pauses execution, user provides input, resume continues with new data.

### AutoGen Human-in-the-Loop (Source: https://github.com/microsoft/autogen)

```python
# Agent pauses for human input
# Agent waits for human feedback before continuing
```

**Key pattern:** Agent can be interrupted for human review at any point.

---

## 4. Approval / Permission Patterns

### Claude Code Permission Modes (Source: https://code.claude.com/docs/en/agent-sdk/permissions)

```
- 'default': requires approval for tools not explicitly allowed
- 'acceptEdits': auto-approves file edits + common FS commands (mkdir, touch, mv, cp)
- 'plan': explore and plan without editing source files
- 'dontAsk': never prompts, runs pre-approved tools, denies others
- 'auto': model classifier approves/denies tool calls
- 'bypassPermissions': runs all allowed tools without prompting (isolated env only)
```

**Key pattern:** 6 modes from strict to bypass, model-based auto-approval.

### Claude Code Auto Mode (Source: https://code.claude.com/docs/en/agent-sdk/permissions)

> "'auto' uses a model classifier to approve or deny tool calls, with availability detailed in the Auto mode documentation."

**Key pattern:** AI decides approval based on risk assessment.

### LangGraph Approval (Source: https://docs.langchain.com/oss/python/langgraph/interrupts)

```python
def approval_node(state):
    is_approved = interrupt({
        "question": "Do you want to proceed with this action?",
        "details": state["action_details"]
    })
    if is_approved:
        return Command(goto="proceed")
    else:
        return Command(goto="cancel")
```

**Key pattern:** Pause before critical action, route based on approval.

---

## 5. Tool Execution Patterns

### Claude Code (Source: https://code.claude.com/docs/en/agent-sdk/agent-loop)

> "The agent supports several permission modes that control how it interacts with tools and files. Tools are executed based on the current permission mode."

**Key pattern:** Permission modes control tool execution.

### AutoGen (Source: https://github.com/microsoft/autogen)

```python
from autogen_agentchat.agents import AssistantAgent

agent = AssistantAgent(
    name="assistant",
    model_client=model_client,
    tools=[get_weather, search_web],  # Tools as functions
    memory=[memory],
)
```

**Key pattern:** Tools as callable functions, integrated with memory.

### CrewAI (Source: https://docs.crewai.com/concepts/tools)

```python
from crewai import Agent, Tool

researcher = Agent(
    role="Research Analyst",
    tools=[search_tool, scrape_tool],
    memory=True,  # Enable memory for this agent
)
```

**Key pattern:** Tools attached to agents, memory-aware execution.

---

## 6. Memory Systems (Complete)

### Claude Code Memory (Source: https://code.claude.com/docs/en/memory)

> "CLAUDE.md files are written by you to provide Claude with instructions and rules, applicable at the project, user, or organization level. Auto memory is written by Claude to store learnings and patterns, scoped per repository and shared across worktrees. Both are loaded into every session. CLAUDE.md is used for guiding coding standards, workflows, and project architecture, while auto memory is for build commands, debugging insights, and preferences Claude discovers."

**Memory types:**
- CLAUDE.md (user-written, project/user/org scoped)
- Auto memory (Claude-written, per-repo)
- Agent memory (subagent-specific, user/project scoped)

### LangGraph Memory (Source: https://docs.langchain.com/oss/python/langgraph/add-memory)

> "LangGraph offers two types of memory: short-term memory, which is part of an agent's state for multi-turn conversations, and long-term memory, used for storing user-specific or application-level data across sessions."

```python
# Short-term: Checkpointer (thread-scoped)
checkpointer = InMemorySaver()

# Long-term: Store (cross-thread)
store = InMemoryStore(
    index={"embed": embeddings, "dims": 1536}
)
store.put(("user_123", "memories"), "1", {"text": "I love pizza"})
items = store.search(("user_123", "memories"), query="food", limit=2)
```

**Memory types:**
- Short-term: Checkpointer (thread-level)
- Long-term: Store (cross-thread, semantic search)

### AutoGen Memory (Source: https://github.com/microsoft/autogen)

```python
# ListMemory — simple fact storage
from autogen_core.memory import ListMemory, MemoryContent

memory = ListMemory()
await memory.add(MemoryContent(content="...", mime_type="text/plain"))

# Mem0Memory — semantic search backend
from autogen_ext.memory.mem0 import Mem0Memory

mem0_memory = Mem0Memory(is_cloud=True, limit=5)

# TaskCentricMemory — retrieve relevant memories per task
from autogen_ext.experimental.task_centric_memory import MemoryController

memory_controller = MemoryController(reset=True, client=client)
memos = await memory_controller.retrieve_relevant_memos(task="...")
```

**Memory types:**
- ListMemory: simple fact storage
- Mem0Memory: semantic search backend
- TaskCentricMemory: task-aware retrieval

### CrewAI Memory (Source: https://docs.crewai.com/concepts/memory)

```python
from crewai import Memory

memory = Memory()
memory.remember("We decided to use PostgreSQL for the user database.")

# Composite scoring (semantic + recency + importance)
matches = memory.recall("What database did we choose?")
for m in matches:
    print(f"[{m.score:.2f}] {m.record.content}")

# Tune scoring weights
memory = Memory(recency_weight=0.5, recency_half_life_days=7)
```

**Memory types:**
- Short-term: immediate context (recency scoring)
- Long-term: persistent patterns (importance scoring)
- Entity: specific attributes (semantic scoring)
- Contextual: cross-interaction continuity

---

## 7. Subagent / Multi-Agent Patterns

### Claude Code Subagents (Source: https://code.claude.com/docs/en/sub-agents)

```bash
# Fork a subtask
/subtask draft unit tests for the parser changes

# Chain subagents
"Use the code-reviewer subagent to find performance issues, 
then use the optimizer subagent to fix them"
```

**Key pattern:** Forked subagents with persistent memory, chainable.

### AutoGen Multi-Agent (Source: https://github.com/microsoft/autogen)

```python
from autogen_agentchat.teams import RoundRobinGroupChat

team = RoundRobinGroupChat(
    agents=[researcher, coder, reviewer],
    memory=[shared_memory],  # Shared memory across agents
)
```

**Key pattern:** Teams with shared memory, round-robin execution.

### CrewAI Crew (Source: https://docs.crewai.com/concepts/crews)

```python
from crewai import Crew, Agent, Task

researcher = Agent(role="Researcher", tools=[search_tool])
writer = Agent(role="Writer", tools=[write_tool])

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    memory=True,  # Enable crew-level memory
)
```

**Key pattern:** Role-based agents, crew-level memory.

---

## 8. Mark Implementation Mapping

| Component | Mark Code | Reference Source |
|-----------|-----------|-----------------|
| Agent loop | `useMarkPlan.js` `while(!isDone)` | Claude Code 3-phase loop |
| Checkpoint | `autonomousTasks.checkpoint` | LangGraph Checkpointer |
| Steer | `steerBufferRef` + `handleSteer()` | Claude Code steering + LangGraph interrupt |
| Approval | 5 modes (strict/selective/auto/bypass/plan) | Claude Code permission modes |
| Memory semantic | `memory` + `documents` + Orama | LangGraph Store + AutoGen Mem0Memory |
| Memory episodic | `chatArchive` + `taskHistory` | CrewAI long-term memory |
| Memory procedural | SKILL.md + plugins | Claude Code CLAUDE.md + agent-memory |
| Scoring | Semantic 0.4 + Recency 0.3 + Importance 0.3 | CrewAI composite scoring |
| Subagent | Deferred (when parallel tasks needed) | Claude Code /subtask + AutoGen teams |

---

## 9. Human Memory → AI Agent Mapping

```
HUMAN MEMORY              AI AGENT PATTERN           MARK IMPLEMENTATION
─────────────────────────────────────────────────────────────────────────

SENSORY (<2s)             Raw input buffer           Screenshot/Audio/DOM buffer
WORKING (15-30s, 4-7)     loopMessages               Current task context
SHORT-TERM (session)      Checkpointer               sessions table
LONG-TERM
├── SEMANTIC (facts)      Store + Mem0Memory         memory + documents + Orama
├── EPISODIC (events)     Long-term memory           chatArchive + taskHistory
├── AUTOBIO (persona)     Agent memory               relationships + persona
└── PROCEDURAL (skills)   CLAUDE.md + SKILL.md       SKILL.md + plugins
PRIMING (recent)          Recency scoring            primingLog + score boost
CONDITIONING (patterns)   TaskCentricMemory          Guard gate + risk scoring
```

---

*Last updated: 2026-07-29*
*Research compiled by: ZCode agent (ATM team)*
