# 🧠 AI Engineer — Chi tiết công việc

> **Project:** Giáo Án Thông Minh V2
> **Stack:** Python 3.11+, FastAPI, LangGraph, OpenAI (GPT-4o), Gemini 1.5 Pro, LangSmith, structlog, pgvector
> **Ngày tạo:** 2026-04-24

---

## Tổng quan

AI Engineer chịu trách nhiệm xây dựng AI Service — một FastAPI service độc lập chạy LangGraph pipeline. Focus: đơn giản hóa agent flow (7→4 nodes), logging/tracing rõ ràng, streaming ổn định.

**Nguyên tắc:**
- AI Service KHÔNG xử lý auth, CRUD, file storage → Gateway lo
- AI Service CHỈ nhận input đã clean từ Gateway, chạy LLM, trả kết quả
- Mọi LLM call phải có LangSmith trace
- Mọi node phải log structured (structlog)
- Pipeline phải đơn giản, dễ debug

---

## Phase 1: Project Setup & Restructure (Ngày 1-2)

### Task 1.1: Restructure project

Tách AI service ra khỏi monolith hiện tại:

```
ai-service/
├── app/
│   ├── __init__.py
│   ├── main.py                     # FastAPI entry
│   ├── config.py                   # Settings (Pydantic BaseSettings)
│   ├── api/
│   │   ├── __init__.py
│   │   ├── generate.py             # POST /ai/generate
│   │   ├── stream.py               # GET /ai/stream/:plan_id
│   │   ├── chat.py                 # POST /ai/chat/:plan_id
│   │   ├── embed.py                # POST /ai/embed, /ai/extract-text
│   │   └── health.py               # GET /ai/health
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── state.py                # GraphState TypedDict
│   │   ├── pipeline.py             # LangGraph StateGraph (4 nodes)
│   │   └── nodes/
│   │       ├── __init__.py
│   │       ├── rag.py              # Node 1: RAG retrieval
│   │       ├── generator.py        # Node 2: Generate (streaming markdown)
│   │       ├── quality_checker.py  # Node 3: Quality validation
│   │       └── formatter.py        # Node 4: JSON convert + DOCX
│   ├── standalone/
│   │   ├── __init__.py
│   │   ├── refiner.py              # Refine section (single LLM call)
│   │   └── qa.py                   # QA response (single LLM call)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── llm.py                  # OpenAI/Gemini client wrapper
│   │   ├── embeddings.py           # Embedding service
│   │   ├── vector_store.py         # pgvector search
│   │   └── file_parser.py          # PDF/DOCX text extraction
│   └── logging/
│       ├── __init__.py
│       ├── setup.py                # structlog configuration
│       └── middleware.py           # Request logging middleware
├── tests/
│   ├── test_pipeline.py
│   ├── test_nodes.py
│   └── test_api.py
├── requirements.txt
├── Dockerfile
└── .env
```

### Task 1.2: Dependencies (`requirements.txt`)

```
fastapi==0.115.*
uvicorn[standard]==0.30.*
sse-starlette==2.*
langchain-core==0.3.*
langgraph==0.2.*
langchain-openai==0.2.*
langsmith==0.1.*
openai==1.*
google-generativeai==0.8.*
structlog==24.*
pdfplumber==0.11.*
python-docx==1.*
asyncpg==0.29.*
pgvector==0.3.*
python-multipart==0.0.*
python-dotenv==1.*
pydantic-settings==2.*
httpx==0.27.*
```

### Task 1.3: Config (`app/config.py`)

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # AI Models
    PRIMARY_MODEL: str = "gpt-4o"
    CHEAP_MODEL: str = "gpt-4o-mini"
    FALLBACK_MODEL: str = "gemini-1.5-pro"
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # API Keys
    OPENAI_API_KEY: str
    GOOGLE_API_KEY: str = ""
    LANGSMITH_API_KEY: str = ""

    # Database
    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str

    # Pipeline config
    MAX_ITERATIONS: int = 2
    RAG_TOP_K: int = 5
    MAX_FILE_SIZE_DIRECT: int = 2000  # chars, above → RAG

    # Tracing
    LANGSMITH_PROJECT: str = "giao-an-thong-minh"
    LANGSMITH_TRACING: bool = True

    class Config:
        env_file = ".env"

settings = Settings()
```

### Task 1.4: Logging setup (`app/logging/setup.py`)

```python
import structlog
import logging

def setup_logging():
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
    )
```

**Mỗi node PHẢI log:**
```python
logger.info("node.start", node="rag", plan_id=plan_id, input_summary="...")
# ... processing ...
logger.info("node.complete", node="rag", plan_id=plan_id, duration_ms=123, output_summary="...")
# On error:
logger.error("node.error", node="rag", plan_id=plan_id, error=str(e), exc_info=True)
```

---

## Phase 2: Core Pipeline (Ngày 2-4)

### Task 2.1: Graph State (`app/graph/state.py`)

```python
from typing import TypedDict, Optional
import asyncio

class GraphState(TypedDict):
    # Identifiers
    plan_id: str
    request_id: str                  # Trace xuyên suốt

    # User input (từ Gateway)
    subject: str
    grade: str
    topic: str
    teaching_model: str              # "5E" | "3-phase"
    objectives: list[str]
    emphasis: str                    # Thay thế clarify
    special_requests: str            # Thay thế clarify
    uploaded_docs: list[str]         # Text đã parse từ files upload
    resource_texts: list[str]        # Text từ user resources đã embed
    system_resource_texts: list[str] # Text từ tài liệu hệ thống (SGK/SGV) user chọn

    # RAG
    rag_context: list[dict]          # Retrieved chunks

    # Generation
    current_markdown: str            # Pass 1 output
    current_plan: dict               # Pass 2 JSON output
    quality_result: dict             # Quality check result
    iteration: int                   # Current iteration (max 2)

    # Streaming
    stream_queue: Optional[asyncio.Queue]

    # Error handling
    error: Optional[str]
```

### Task 2.2: Pipeline (`app/graph/pipeline.py`)

```python
from langgraph.graph import StateGraph, END
from app.graph.state import GraphState
from app.graph.nodes import rag, generator, quality_checker, formatter

def build_pipeline() -> StateGraph:
    graph = StateGraph(GraphState)

    # 4 nodes — đơn giản, rõ ràng
    graph.add_node("rag_retrieval", rag.run)
    graph.add_node("generator", generator.run)
    graph.add_node("quality_check", quality_checker.run)
    graph.add_node("formatter", formatter.run)

    # Flow: RAG → Generate → Quality Check → (pass: Format / fail: retry Generate)
    graph.set_entry_point("rag_retrieval")
    graph.add_edge("rag_retrieval", "generator")
    graph.add_edge("generator", "quality_check")
    graph.add_conditional_edges("quality_check", should_retry, {
        "pass": "formatter",
        "retry": "generator",
    })
    graph.add_edge("formatter", END)

    return graph.compile()

def should_retry(state: GraphState) -> str:
    qr = state.get("quality_result", {})
    iteration = state.get("iteration", 0)
    if qr.get("status") == "PASSED" or iteration >= 2:
        return "pass"
    return "retry"

# Singleton
pipeline = build_pipeline()
```

### Task 2.3: Node 1 — RAG Retrieval (`app/graph/nodes/rag.py`)

```python
from langsmith import traceable
import structlog

logger = structlog.get_logger()

@traceable(name="rag_retrieval")
async def run(state: GraphState) -> GraphState:
    """
    1. Embed query: subject + grade + topic
    2. Search pgvector: top-K similar chunks (cả system + user embeddings)
    3. Merge với uploaded_docs + resource_texts + system_resource_texts
    4. Return rag_context

    Lưu ý: system_resource_texts chứa nội dung SGK/SGV user đã chọn.
    Nội dung này được ưu tiên trong context (đặt trước) vì là tài liệu
    chính thức, đáng tin cậy hơn uploaded docs.
    """
    logger.info("rag.start", plan_id=state["plan_id"],
                subject=state["subject"], topic=state["topic"],
                has_system_resources=bool(state.get("system_resource_texts")))

    # Push progress event
    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "rag", "label": "Đang tra cứu tài liệu..."}
        })

    # ... implementation ...

    logger.info("rag.complete", plan_id=state["plan_id"],
                chunks_found=len(rag_context), duration_ms=elapsed)

    return {**state, "rag_context": rag_context}
```

### Task 2.4: Node 2 — Generator (`app/graph/nodes/generator.py`)

```python
@traceable(name="generator")
async def run(state: GraphState) -> GraphState:
    """
    1. Build prompt: system + rag_context + user input (objectives, emphasis, special_requests)
    2. Call LLM with stream=True
    3. Push each chunk to stream_queue (SSE)
    4. Accumulate full markdown
    5. Convert markdown → JSON (Pass 2, gpt-4o-mini)
    6. Return current_markdown + current_plan
    """
    iteration = state.get("iteration", 0)
    quality_feedback = state.get("quality_result", {}).get("feedback", "")

    logger.info("generator.start", plan_id=state["plan_id"],
                iteration=iteration, has_feedback=bool(quality_feedback))

    # Push progress
    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "generating", "label": f"Đang soạn giáo án... (lần {iteration + 1})"}
        })

    # Build prompt
    system_prompt = build_system_prompt(
        subject=state["subject"],
        grade=state["grade"],
        topic=state["topic"],
        teaching_model=state["teaching_model"],
        rag_context=state["rag_context"],
        objectives=state.get("objectives", []),
        emphasis=state.get("emphasis", ""),
        special_requests=state.get("special_requests", ""),
        quality_feedback=quality_feedback,
        system_resource_texts=state.get("system_resource_texts", []),  # SGK/SGV content
    )
    # Lưu ý: system_resource_texts (SGK/SGV) được inject vào prompt với priority cao hơn
    # uploaded_docs vì đây là tài liệu chính thức, đáng tin cậy.

    # Stream LLM response
    full_markdown = ""
    async for chunk in llm_client.stream(system_prompt, model=settings.PRIMARY_MODEL):
        full_markdown += chunk
        if state.get("stream_queue"):
            await state["stream_queue"].put({
                "event": "chunk",
                "data": {"type": "markdown", "delta": chunk}
            })

    # Pass 2: Convert MD → JSON
    plan_json = await convert_markdown_to_json(full_markdown)

    logger.info("generator.complete", plan_id=state["plan_id"],
                markdown_length=len(full_markdown), iteration=iteration)

    return {
        **state,
        "current_markdown": full_markdown,
        "current_plan": plan_json,
        "iteration": iteration + 1,
    }
```

### Task 2.5: Node 3 — Quality Checker (`app/graph/nodes/quality_checker.py`)

```python
@traceable(name="quality_check")
async def run(state: GraphState) -> GraphState:
    """
    Rule-based + LLM check.
    Rules:
      1. Has all required sections (5E: 5 phases / 3-phase: 3 phases)
      2. Each section has: mục tiêu, nội dung, sản phẩm, tổ chức
      3. Objectives: ≥2 competencies + ≥1 quality
      4. Materials not empty
      5. Subject/Grade/Topic metadata present
    LLM check:
      - Content alignment with objectives
      - GDPT 2018 compliance
    Return: { status: "PASSED"|"FAILED", feedback: "...", errors: [...] }
    """
```

### Task 2.6: Node 4 — Formatter (`app/graph/nodes/formatter.py`)

```python
@traceable(name="formatter")
async def run(state: GraphState) -> GraphState:
    """
    1. Finalize JSON structure
    2. Generate DOCX file (python-docx)
    3. Upload DOCX to Supabase Storage (via Gateway or direct)
    4. Push 'plan' event (full JSON)
    5. Push 'done' event (docx_url)
    """
```

---

## Phase 3: Standalone Functions (Ngày 4-5)

### Task 3.1: Refiner (`app/standalone/refiner.py`)

**Không cần LangGraph — chỉ 1 LLM call.**

```python
@traceable(name="refine")
async def refine(
    plan_id: str,
    current_plan: dict,
    current_markdown: str,
    user_message: str,
    stream_queue: asyncio.Queue,
) -> dict:
    """
    1. Build prompt: current plan + user request
    2. LLM identifies which section to modify
    3. Stream modified section
    4. Return updated plan JSON

    Model: PRIMARY_MODEL (GPT-4o) — cần reasoning tốt
    """
    logger.info("refiner.start", plan_id=plan_id, message_preview=user_message[:100])

    prompt = f"""
    Giáo án hiện tại:
    {current_markdown}

    Yêu cầu chỉnh sửa của giáo viên:
    {user_message}

    Hãy chỉnh sửa phần liên quan. Chỉ trả lại phần đã sửa, giữ nguyên format markdown.
    """

    result = ""
    async for chunk in llm_client.stream(prompt, model=settings.PRIMARY_MODEL):
        result += chunk
        await stream_queue.put({
            "event": "chunk",
            "data": {"type": "markdown", "delta": chunk}
        })

    # Merge back into full plan
    updated_plan = merge_section(current_plan, result)

    logger.info("refiner.complete", plan_id=plan_id, changed_section="...")
    return updated_plan
```

### Task 3.2: QA Responder (`app/standalone/qa.py`)

```python
@traceable(name="qa_response")
async def answer(
    plan_id: str,
    current_plan: dict,
    question: str,
    stream_queue: asyncio.Queue,
) -> str:
    """
    Trả lời câu hỏi về giáo án. KHÔNG sửa giáo án.
    Model: CHEAP_MODEL (GPT-4o-mini) — tiết kiệm chi phí
    """
    logger.info("qa.start", plan_id=plan_id, question_preview=question[:100])

    prompt = f"""
    Giáo án:
    {json.dumps(current_plan, ensure_ascii=False)}

    Câu hỏi: {question}

    Trả lời ngắn gọn, chính xác.
    """

    result = ""
    async for chunk in llm_client.stream(prompt, model=settings.CHEAP_MODEL):
        result += chunk
        await stream_queue.put({
            "event": "chat",
            "data": {"role": "assistant", "delta": chunk}
        })

    logger.info("qa.complete", plan_id=plan_id, answer_length=len(result))
    return result
```

---

## Phase 4: API Endpoints (Ngày 5-6)

### Task 4.1: Generate endpoint (`app/api/generate.py`)

```python
@router.post("/ai/generate")
async def generate(request: GenerateRequest):
    """
    Nhận request từ API Gateway, khởi chạy pipeline trong background.
    Response ngay lập tức 202.
    """
    plan_id = request.plan_id

    # Parse files nếu có URL
    uploaded_docs = []
    for url in request.file_urls:
        text = await file_parser.extract_from_url(url)
        uploaded_docs.append(text)

    # Lấy content text từ system resources (SGK/SGV) nếu có
    system_resource_texts = []
    for sr_id in (request.system_resource_ids or []):
        text = await get_system_resource_text(sr_id)  # Query DB hoặc nhận từ Gateway
        if text:
            system_resource_texts.append(text)

    # Init state
    initial_state = GraphState(
        plan_id=plan_id,
        request_id=request.request_id,
        subject=request.subject,
        grade=request.grade,
        topic=request.topic,
        teaching_model=request.teaching_model,
        objectives=request.objectives or [],
        emphasis=request.emphasis or "",
        special_requests=request.special_requests or "",
        uploaded_docs=uploaded_docs,
        resource_texts=[],
        system_resource_texts=system_resource_texts,
        rag_context=[],
        current_markdown="",
        current_plan={},
        quality_result={},
        iteration=0,
        stream_queue=None,  # Set when SSE connects
        error=None,
    )

    # Store state, waiting for SSE connection
    state_store[plan_id] = initial_state

    return {"status": "accepted", "plan_id": plan_id}
```

### Task 4.2: Stream endpoint (`app/api/stream.py`)

```python
@router.get("/ai/stream/{plan_id}")
async def stream(plan_id: str, request: Request):
    """
    SSE endpoint. Khi client connect:
    1. Create asyncio.Queue
    2. Run pipeline in background task
    3. Yield events from queue
    """
    queue = asyncio.Queue()
    state = state_store.get(plan_id)
    if not state:
        raise HTTPException(404, "Plan not found")

    state["stream_queue"] = queue

    async def event_generator():
        # Run pipeline in background
        task = asyncio.create_task(run_pipeline(state))

        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=300)
                if event.get("event") == "done":
                    yield {"event": event["event"], "data": json.dumps(event["data"])}
                    break
                yield {"event": event["event"], "data": json.dumps(event["data"])}
        except asyncio.TimeoutError:
            yield {"event": "error", "data": json.dumps({"message": "Timeout"})}
        except Exception as e:
            logger.error("stream.error", plan_id=plan_id, error=str(e))
            yield {"event": "error", "data": json.dumps({"message": str(e)})}
        finally:
            if not task.done():
                task.cancel()

    return EventSourceResponse(event_generator())
```

### Task 4.3: Chat endpoint (`app/api/chat.py`)

```python
@router.post("/ai/chat/{plan_id}")
async def chat(plan_id: str, request: ChatRequest):
    """
    Nhận message từ Gateway.
    Phân loại đơn giản (không cần LLM):
    - Có keyword sửa/đổi/thêm/bớt → refiner
    - Còn lại → qa
    """
    message = request.message

    # Simple intent classification (no LLM needed)
    action = classify_intent(message)

    state = state_store.get(plan_id)
    if not state:
        raise HTTPException(404)

    queue = state.get("stream_queue") or asyncio.Queue()
    state["stream_queue"] = queue

    if action == "refine":
        asyncio.create_task(refiner.refine(
            plan_id=plan_id,
            current_plan=state["current_plan"],
            current_markdown=state["current_markdown"],
            user_message=message,
            stream_queue=queue,
        ))
    else:  # qa
        asyncio.create_task(qa.answer(
            plan_id=plan_id,
            current_plan=state["current_plan"],
            question=message,
            stream_queue=queue,
        ))

    return {"status": "accepted"}

def classify_intent(message: str) -> str:
    """Rule-based, không cần LLM call."""
    refine_keywords = ["sửa", "đổi", "thêm", "bớt", "làm lại", "thay", "chỉnh", "cập nhật", "update"]
    message_lower = message.lower()
    if any(kw in message_lower for kw in refine_keywords):
        return "refine"
    return "qa"
```

---

## Phase 5: Services (Ngày 6-7)

### Task 5.1: LLM Client (`app/services/llm.py`)

```python
class LLMClient:
    """Wrapper cho OpenAI + Gemini với retry + fallback."""

    async def stream(self, prompt: str, model: str = None) -> AsyncIterator[str]:
        """Stream response tokens."""
        model = model or settings.PRIMARY_MODEL
        try:
            # Try primary model
            async for chunk in self._openai_stream(prompt, model):
                yield chunk
        except Exception as e:
            logger.warning("llm.fallback", model=model, error=str(e))
            # Fallback to Gemini
            async for chunk in self._gemini_stream(prompt):
                yield chunk

    async def call(self, prompt: str, model: str = None) -> str:
        """Non-streaming call."""
        # ...

    async def _openai_stream(self, prompt, model):
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

### Task 5.2: Embedding Service (`app/services/embeddings.py`)

```python
class EmbeddingService:
    async def embed(self, text: str) -> list[float]:
        """Embed single text."""

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts."""

    async def search(self, query: str, top_k: int = 5, filter: dict = None) -> list[dict]:
        """Search pgvector for similar chunks."""
```

### Task 5.3: File Parser (`app/services/file_parser.py`)

```python
class FileParser:
    async def extract_from_url(self, file_url: str) -> str:
        """Download file from URL and extract text."""
        # Download
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            content = response.content

        # Detect type
        if file_url.endswith('.pdf'):
            return self._parse_pdf(content)
        elif file_url.endswith('.docx'):
            return self._parse_docx(content)
        else:
            return content.decode('utf-8')

    def _parse_pdf(self, content: bytes) -> str:
        """Extract text from PDF using pdfplumber."""

    def _parse_docx(self, content: bytes) -> str:
        """Extract text from DOCX using python-docx."""
```

---

## Phase 6: Logging & Tracing (Ngày 7-8)

### Task 6.1: LangSmith integration

```python
# .env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=giao-an-thong-minh

# Mỗi function dùng @traceable
from langsmith import traceable

@traceable(name="rag_retrieval", tags=["node"])
async def rag_run(state): ...

@traceable(name="generator", tags=["node"])
async def generator_run(state): ...

@traceable(name="quality_check", tags=["node"])
async def quality_run(state): ...
```

**LangSmith trace sẽ tự động capture:**
- Input/output mỗi node
- Token usage + cost
- Latency per node
- Error traces
- Full conversation flow

### Task 6.2: Request tracing middleware

```python
import structlog
from starlette.middleware.base import BaseHTTPMiddleware

class RequestTracingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid4()))

        # Bind request_id to all logs in this request
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        logger.info("request.start",
            method=request.method,
            path=request.url.path)

        response = await call_next(request)

        logger.info("request.complete",
            method=request.method,
            path=request.url.path,
            status=response.status_code)

        response.headers["x-request-id"] = request_id
        return response
```

### Task 6.3: Node execution logger (decorator)

```python
def log_node(func):
    """Decorator tự động log start/complete/error cho mỗi node."""
    @functools.wraps(func)
    async def wrapper(state: GraphState) -> GraphState:
        node_name = func.__name__
        plan_id = state.get("plan_id", "unknown")
        start = time.monotonic()

        logger.info("node.start", node=node_name, plan_id=plan_id)
        try:
            result = await func(state)
            elapsed = (time.monotonic() - start) * 1000
            logger.info("node.complete", node=node_name, plan_id=plan_id, duration_ms=round(elapsed))
            return result
        except Exception as e:
            elapsed = (time.monotonic() - start) * 1000
            logger.error("node.error", node=node_name, plan_id=plan_id,
                        duration_ms=round(elapsed), error=str(e), exc_info=True)
            raise
    return wrapper

# Usage:
@log_node
@traceable(name="rag_retrieval")
async def rag_run(state: GraphState) -> GraphState:
    ...
```

---

## Phase 7: Testing & Documentation (Ngày 9-10)

### Task 7.1: Unit tests

```python
# tests/test_pipeline.py
async def test_full_pipeline():
    """Test happy path: RAG → Generate → QC → Format"""

async def test_pipeline_retry():
    """Test: QC fails → generator retries → QC passes"""

async def test_pipeline_max_iterations():
    """Test: QC fails 2x → exits anyway"""

# tests/test_nodes.py
async def test_rag_with_context():
    """Test RAG returns relevant chunks"""

async def test_generator_streaming():
    """Test generator pushes chunks to queue"""

async def test_quality_checker_pass():
    """Test valid plan passes QC"""

async def test_quality_checker_fail():
    """Test invalid plan fails QC with feedback"""

# tests/test_standalone.py
async def test_refiner():
    """Test refine modifies only target section"""

async def test_qa():
    """Test QA answers without modifying plan"""

async def test_classify_intent():
    """Test keyword-based intent classification"""
```

### Task 7.2: Integration test

- [ ] Test với real OpenAI API (test key)
- [ ] Test SSE streaming end-to-end
- [ ] Test với các môn học khác nhau
- [ ] Test file parsing (PDF, DOCX)
- [ ] Test fallback: OpenAI down → Gemini

### Task 7.3: Prompt engineering

- [ ] System prompt cho generator: chuẩn GDPT 2018, template 5E/3-phase
- [ ] Prompt cho quality checker: checklist rõ ràng
- [ ] Prompt cho refiner: chỉ sửa phần yêu cầu
- [ ] Prompt cho JSON converter: schema rõ ràng
- [ ] **Lưu tất cả prompts vào file riêng** (`app/prompts/`) để dễ iterate

---

## Giao tiếp với BE Engineer

AI Service expose các endpoint sau cho API Gateway:

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/ai/generate` | POST | `{ plan_id, subject, grade, topic, teaching_model, objectives, emphasis, special_requests, file_urls, resource_ids, system_resource_ids }` | `{ status: "accepted" }` |
| `/ai/stream/:plan_id` | GET | — | SSE events |
| `/ai/chat/:plan_id` | POST | `{ message, file_urls }` | `{ status: "accepted" }` |
| `/ai/extract-text` | POST | `{ file_url }` | `{ text, page_count }` |
| `/ai/embed` | POST | `{ text }` | `{ embedding: number[] }` |
| `/ai/health` | GET | — | `{ status: "ok", models: {...} }` |

**Lưu ý `system_resource_ids`:** Danh sách UUID tài liệu hệ thống (SGK/SGV) user chọn. AI Service cần query content_text từ DB (bảng resources WHERE is_system=true) hoặc nhận trực tiếp từ Gateway (recommend Gateway resolve và gửi text luôn để giảm coupling).

### SSE Event Format

```
event: progress
data: {"step": "rag"|"generating"|"quality_check"|"formatting", "label": "..."}

event: chunk
data: {"type": "markdown", "delta": "..."}

event: chat
data: {"role": "assistant", "delta": "..."}

event: plan
data: {full JSON lesson plan}

event: done
data: {"plan_id": "...", "docx_url": "...", "status": "completed", "compliance": "PASSED"|"FAILED"}

event: error
data: {"message": "...", "recoverable": true|false}
```

---

## Debug Checklist

Khi có bug, kiểm tra theo thứ tự:

1. **LangSmith dashboard** → xem trace của LLM call (input, output, latency)
2. **structlog output** → search by `plan_id` và `request_id`
3. **Node logs** → `node.start` / `node.complete` / `node.error` cho mỗi bước
4. **SSE events** → kiểm tra client có nhận đúng event format
5. **State store** → kiểm tra `state_store[plan_id]` có đúng data

---

## Tối ưu hiệu suất (sau MVP)

| Cải tiến | Effort | Impact |
|---------|--------|--------|
| Cache RAG results (same subject+grade+topic) | 🟢 Thấp | Giảm latency 2-3s |
| Batch embedding cho resources | 🟢 Thấp | Giảm embedding time 60% |
| LangGraph PostgresSaver (checkpoint) | 🟡 TB | Recover từ crash |
| Redis pub/sub thay asyncio.Queue | 🟡 TB | Scale multi-instance |
| Gemini 2.0 Flash cho QA/QC | 🟢 Thấp | Giảm cost 80% |
| Prompt caching (OpenAI/Anthropic) | 🟢 Thấp | Giảm cost 50% |

---

*File này dành riêng cho AI Engineer. Xem ARCHITECTURE_UPGRADE_PLAN.md cho tổng quan hệ thống.*
