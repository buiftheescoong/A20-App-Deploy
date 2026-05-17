# Sơ đồ kiến trúc

Dự án: A20 App 003 - Soạn giáo án thông minh

Cập nhật lần cuối: 2026-05-16

## Sơ đồ tóm tắt theo yêu cầu

Sơ đồ này dùng để đối chiếu nhanh với yêu cầu trong ảnh: người dùng đi qua frontend, backend/API, database, AI Agent/LLM và các dịch vụ bên ngoài; phần chi tiết bên dưới mô tả đúng các kết nối triển khai thực tế.

```mermaid
flowchart LR
    User["User\nGiáo viên"]
    Frontend["Frontend\nReact + Vite"]
    Backend["Backend/API\nFastify Gateway"]
    Database["Database\nSupabase PostgreSQL + Storage + pgvector"]
    Agent["AI Agent/LLM\nFastAPI + LangGraph"]
    External["External Services\nOpenAI + Gemini + Render"]

    User --> Frontend
    Frontend --> Backend
    Backend --> Database
    Database --> Agent
    Agent --> External
    Agent -. "kết quả sinh giáo án, đánh giá, DOCX" .-> Database
    Backend -. "SSE/API response" .-> Frontend
```

## 1. Bối cảnh hệ thống

```mermaid
flowchart LR
    Teacher["Giáo viên / Người duyệt"]
    Browser["Giao diện trình duyệt\nReact + Vite"]
    Gateway["API Gateway\nFastify + TypeScript"]
    AI["AI Service\nFastAPI + LangGraph"]
    Supabase["Supabase\nAuth + PostgreSQL + Storage + pgvector"]
    LLM["Nhà cung cấp LLM\nOpenAI + Gemini"]
    Raw["Kho dữ liệu chương trình\ndata/raw Markdown"]

    Teacher --> Browser
    Browser -->|"REST + SSE"| Gateway
    Gateway -->|"Xác thực JWT + CRUD"| Supabase
    Gateway -->|"REST nội bộ + SSE proxy"| AI
    AI -->|"Đọc/ghi RAG"| Supabase
    AI -->|"Sinh nội dung + embedding"| LLM
    Raw -->|"ingest_raw_data.py"| AI
```

## 2. Sơ đồ container

```mermaid
flowchart TB
    subgraph Frontend["frontend/ - React, Vite, Tailwind"]
        Home["/"]
        Login["/login"]
        Generate["/generate"]
        Streaming["/generate/:planId"]
        PlanDetail["/plans/:id"]
        Library["/library"]
        Resources["/resources"]
        Check["/check"]
        ApiClient["src/lib/api.ts"]
        Stores["Zustand stores"]
    end

    subgraph Gateway["api-gateway/ - Node.js, Fastify, Drizzle"]
        AuthPlugin["plugins/auth.ts"]
        PlanRoutes["routes/plans.ts"]
        StreamRoutes["routes/stream.ts"]
        ChatRoutes["routes/chat.ts"]
        ResourceRoutes["routes/resources.ts"]
        SystemRoutes["routes/system-resources.ts"]
        StorageSvc["services/storage.ts"]
        AIClient["services/ai-client.ts"]
        Schema["db/schema.ts"]
    end

    subgraph AIService["ai-service/ - FastAPI, LangGraph"]
        Health["api/health.py"]
        GenerateApi["api/generate.py"]
        StreamApi["api/stream.py"]
        ChatApi["api/chat.py"]
        QualityApi["api/quality_check.py"]
        Pipeline["graph/pipeline.py"]
        RAG["graph/nodes/rag.py"]
        Generator["graph/nodes/generator.py"]
        Quality["graph/nodes/quality_checker.py"]
        JSONConv["graph/nodes/json_converter.py"]
        Formatter["graph/nodes/formatter.py"]
        Ingestor["services/raw_data_ingestor.py"]
    end

    subgraph Data["Supabase"]
        Auth["Auth users + JWT"]
        DB["PostgreSQL tables"]
        Storage["Storage buckets"]
        Vector["pgvector embeddings"]
    end

    Frontend --> Gateway
    Gateway --> Data
    Gateway --> AIService
    AIService --> Data
    Pipeline --> RAG --> Vector
    Pipeline --> Generator --> Quality --> JSONConv --> Formatter
    Ingestor --> DB
    Ingestor --> Vector
```

## 3. Luồng sinh giáo án chính

```mermaid
sequenceDiagram
    actor T as Giáo viên
    participant FE as Frontend
    participant GW as API Gateway
    participant DB as Supabase DB
    participant ST as Supabase Storage
    participant AI as AI Service
    participant LLM as OpenAI/Gemini

    T->>FE: Điền SmartForm và gửi yêu cầu
    FE->>GW: POST /api/plans (multipart form)
    GW->>ST: Tải tài liệu đính kèm lên Storage
    GW->>DB: Tạo lesson_plans row (pending)
    GW->>AI: POST /ai/generate
    AI-->>GW: 202 accepted
    GW->>DB: Cập nhật status = generating
    GW-->>FE: 202 + plan_id
    FE->>GW: GET /api/plans/:id/stream
    GW->>AI: GET /ai/stream/:id
    AI->>DB: Lấy tài nguyên và RAG chunks
    AI->>LLM: Sinh markdown và nội dung có cấu trúc
    AI->>LLM: Kiểm tra chất lượng / sửa nếu cần
    AI-->>GW: SSE progress, plan, done
    GW->>DB: Lưu markdown, JSON, status, docx_url
    GW-->>FE: SSE progress, plan, done
    FE->>GW: GET /api/plans/:id/export
    GW->>AI: GET /ai/plans/:id/docx nếu cần
    GW-->>FE: URL tải DOCX hoặc file response
```

## 4. Tổng quan mô hình dữ liệu

```mermaid
erDiagram
    lesson_plans {
        uuid id PK
        uuid user_id
        text subject
        text grade
        text topic
        text teaching_model
        text content_markdown
        jsonb content_json
        text status
        text compliance_status
        text docx_url
        timestamp created_at
        timestamp updated_at
    }

    lesson_plan_messages {
        uuid id PK
        uuid plan_id FK
        text role
        text content
        text message_type
        jsonb attached_files
        timestamp created_at
    }

    resources {
        uuid id PK
        uuid user_id
        text filename
        text file_url
        text content_text
        boolean is_system
        boolean is_embedded
        text category
        text subject
        text grade
        jsonb metadata
    }

    resource_embeddings {
        uuid id PK
        uuid resource_id FK
        integer chunk_index
        text chunk_text
        vector embedding
        jsonb metadata
    }

    lesson_plans ||--o{ lesson_plan_messages : "có"
    resources ||--o{ resource_embeddings : "được index thành"
```

## 5. Cổng chạy cục bộ

| Thành phần | URL cục bộ | Ghi chú |
|---|---|---|
| Frontend | `http://localhost:5173` | Vite dev server |
| API Gateway | `http://localhost:3001` | Fastify REST API và SSE proxy |
| AI Service | `http://localhost:8000` | FastAPI service nội bộ |
| Supabase | Cloud project | Auth, PostgreSQL, Storage, pgvector |

## 6. Kiến trúc triển khai

`render.yaml` định nghĩa ba service trên Render:

```mermaid
flowchart LR
    FE["a20-frontend-ui\nNode web service"]
    GW["a20-api-gateway\nNode web service"]
    AI["a20-ai-service\nPython web service"]
    SB["Supabase cloud"]
    LLM["OpenAI / Gemini"]

    FE --> GW
    GW --> AI
    GW --> SB
    AI --> SB
    AI --> LLM
```

## 7. Quyết định kiến trúc chính

| Quyết định | Lý do |
|---|---|
| Tách API Gateway và AI Service | Tách phần CRUD/auth/SSE proxy khỏi phần điều phối AI và thư viện Python |
| Dùng SSE thay vì WebSocket | Luồng tiến trình sinh giáo án chủ yếu một chiều, SSE đơn giản và đủ dùng |
| Lưu nội dung giáo án trong PostgreSQL | Giáo án vẫn còn sau khi refresh trình duyệt hoặc restart service |
| Định dạng DOCX trong AI Service | Python đã có thư viện xử lý tài liệu phù hợp với pipeline |
| Dùng Supabase cho Auth, DB, Storage, pgvector | Giảm số lượng hạ tầng cần vận hành cho MVP |
| Dùng Markdown thô cho RAG | Dễ đọc, dễ diff, dễ ingest và dễ chia chunk theo tài liệu chương trình |

## 8. Giới hạn hiện tại

- AI Service đang giữ trạng thái generation đang chạy trong bộ nhớ, nên job chưa hoàn tất có thể bị gián đoạn nếu service restart.
- Kho RAG thô hiện tập trung vào Toán 8 và Khoa học tự nhiên 8.
- Một số chuỗi giao diện trong source vẫn bị lỗi encoding và cần một lượt dọn riêng.
- Dữ liệu seed tài nguyên hệ thống chỉ là placeholder, không tương đương tài nguyên đã có embedding đầy đủ.
