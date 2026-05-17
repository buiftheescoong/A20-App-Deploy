/**
 * V2 Mock data — used when NEXT_PUBLIC_USE_MOCK=true.
 * Allows FE development without running the backend.
 */
import type { Plan, Resource, SystemResource, Message, LessonPlanJSON } from './types';

// ────── Mock Lesson Plan JSON ──────

export const MOCK_PLAN_JSON: LessonPlanJSON = {
  metadata: {
    subject: 'Toán',
    grade: '10',
    topic: 'Hàm số bậc nhất',
    teaching_model: '5E',
    duration_minutes: 45,
    objectives: [
      'Học sinh nhận diện được dạng hàm số bậc nhất y = ax + b (a ≠ 0)',
      'Vẽ được đồ thị hàm số bậc nhất',
      'Vận dụng giải bài tập thực tế',
    ],
    competencies: ['Tư duy và lập luận toán học', 'Giải quyết vấn đề'],
    materials: ['SGK Toán 10', 'Thước kẻ', 'Máy tính'],
  },
  sections: {
    engage: { title: 'Khởi động (Engage)', content: 'GV đưa tình huống thực tế về quãng đường.', duration: 5 },
    explore: { title: 'Khám phá (Explore)', content: 'HS thảo luận các ví dụ hàm bậc nhất.', duration: 10 },
    explain: { title: 'Giải thích (Explain)', content: 'GV chính xác hóa khái niệm.', duration: 15 },
    elaborate: { title: 'Vận dụng (Elaborate)', content: 'HS thực hành vẽ đồ thị.', duration: 10 },
    evaluate: { title: 'Đánh giá (Evaluate)', content: 'Trắc nghiệm tổng kết.', duration: 5 },
  },
  rag_sources: ['sgk_toan_10_chuong2_p15'],
  compliance: { status: 'PASSED', errors: [] },
};

// ────── Mock Streaming Markdown ──────

export const MOCK_STREAMING_MARKDOWN = `# Giáo án: Hàm số bậc nhất

## I. MỤC TIÊU

### 1. Kiến thức
- Nhận diện được dạng hàm số bậc nhất y = ax + b (a ≠ 0)
- Hiểu ý nghĩa hình học của hệ số a và b

### 2. Năng lực
- Tư duy và lập luận toán học
- Giải quyết vấn đề toán học

## II. THIẾT BỊ DẠY HỌC
- SGK Toán 10
- Thước kẻ, máy tính

## III. TIẾN TRÌNH DẠY HỌC

### Hoạt động 1: Khởi động (5 phút)
GV đưa ra tình huống thực tế: "Một xe ô tô chạy với vận tốc 60 km/h..."

### Hoạt động 2: Hình thành kiến thức (15 phút)
| Nội dung | Hoạt động GV | Hoạt động HS |
|----------|-------------|-------------|
| Định nghĩa | Giới thiệu công thức y = ax + b | Ghi chép, đặt câu hỏi |
| Đồ thị | Hướng dẫn cách vẽ | Thực hành vẽ |

### Hoạt động 3: Luyện tập (15 phút)
Vẽ đồ thị y = 2x + 1 và y = -x + 3

### Hoạt động 4: Vận dụng (10 phút)
Bài tập thực tế liên quan đến đời sống

## IV. RÚT KINH NGHIỆM
_Ghi chú sau tiết dạy_
`;

// ────── Mock Plans ──────

export const MOCK_PLANS: Plan[] = [
  {
    id: 'plan-001', userId: 'user-1', subject: 'Toán', grade: '10',
    topic: 'Hàm số bậc nhất', teachingModel: '5E',
    objectives: ['Nhận diện hàm số bậc nhất'], emphasis: null, specialRequests: null,
    resourceIds: null, contentMarkdown: MOCK_STREAMING_MARKDOWN,
    contentJson: MOCK_PLAN_JSON, sessionState: {}, status: 'completed',
    iterationCount: 1, complianceStatus: 'PASSED', docxUrl: '/mock.docx',
    isBlankTemplate: false, createdAt: '2026-04-20T10:00:00Z', updatedAt: '2026-04-20T10:05:00Z',
  },
  {
    id: 'plan-002', userId: 'user-1', subject: 'Vật Lý', grade: '11',
    topic: 'Định luật Newton', teachingModel: '3-phase',
    objectives: ['Phát biểu ba định luật Newton'], emphasis: 'Thí nghiệm minh họa', specialRequests: null,
    resourceIds: null, contentMarkdown: null, contentJson: null,
    sessionState: {}, status: 'generating', iterationCount: 0,
    complianceStatus: 'PENDING', docxUrl: null, isBlankTemplate: false,
    createdAt: '2026-04-22T14:00:00Z', updatedAt: '2026-04-22T14:00:00Z',
  },
  {
    id: 'plan-003', userId: 'user-1', subject: 'Ngữ văn', grade: '9',
    topic: 'Truyện Kiều — Chí khí anh hùng', teachingModel: '5E',
    objectives: ['Phân tích nhân vật Từ Hải'], emphasis: null, specialRequests: null,
    resourceIds: null, contentMarkdown: MOCK_STREAMING_MARKDOWN,
    contentJson: MOCK_PLAN_JSON, sessionState: {}, status: 'completed',
    iterationCount: 1, complianceStatus: 'FAILED', docxUrl: null,
    isBlankTemplate: false, createdAt: '2026-04-18T09:00:00Z', updatedAt: '2026-04-18T09:10:00Z',
  },
];

// ────── Mock System Resources ──────

export const MOCK_SYSTEM_RESOURCES: SystemResource[] = [
  {
    id: 'sr-001', userId: null, filename: 'SGK Toán 10', fileUrl: '/mock/sgk-toan-10.pdf',
    fileSize: 15_000_000, pageCount: 180, contentText: 'Nội dung SGK Toán 10...',
    isEmbedded: true, isSystem: true, category: 'sgk', subject: 'Toán', grade: '10',
    description: 'Sách giáo khoa Toán 10 — Chương trình GDPT 2018',
    metadata: {}, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'sr-002', userId: null, filename: 'SGV Toán 10', fileUrl: '/mock/sgv-toan-10.pdf',
    fileSize: 12_000_000, pageCount: 150, contentText: 'Nội dung SGV Toán 10...',
    isEmbedded: true, isSystem: true, category: 'sgv', subject: 'Toán', grade: '10',
    description: 'Sách giáo viên Toán 10 — Hướng dẫn giảng dạy',
    metadata: {}, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'sr-003', userId: null, filename: 'SGK Toán 11', fileUrl: '/mock/sgk-toan-11.pdf',
    fileSize: 16_000_000, pageCount: 200, contentText: 'Nội dung SGK Toán 11...',
    isEmbedded: true, isSystem: true, category: 'sgk', subject: 'Toán', grade: '11',
    description: 'Sách giáo khoa Toán 11 — Chương trình GDPT 2018',
    metadata: {}, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'sr-004', userId: null, filename: 'SGK Vật Lý 10', fileUrl: '/mock/sgk-vatly-10.pdf',
    fileSize: 14_000_000, pageCount: 170, contentText: 'Nội dung SGK Vật Lý 10...',
    isEmbedded: true, isSystem: true, category: 'sgk', subject: 'Vật Lý', grade: '10',
    description: 'Sách giáo khoa Vật Lý 10 — Chương trình GDPT 2018',
    metadata: {}, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'sr-005', userId: null, filename: 'SGK Ngữ văn 9', fileUrl: '/mock/sgk-nguvan-9.pdf',
    fileSize: 13_000_000, pageCount: 190, contentText: 'Nội dung SGK Ngữ văn 9...',
    isEmbedded: true, isSystem: true, category: 'sgk', subject: 'Ngữ văn', grade: '9',
    description: 'Sách giáo khoa Ngữ văn 9 — Chương trình GDPT 2018',
    metadata: {}, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  },
];

// ────── Mock User Resources ──────

export const MOCK_USER_RESOURCES: Resource[] = [
  {
    id: 'ur-001', userId: 'user-1', filename: 'de_cuong_toan_10.pdf',
    fileUrl: '/mock/de_cuong.pdf', fileSize: 2_500_000, pageCount: 15,
    contentText: 'Đề cương ôn tập...', isEmbedded: false, isSystem: false,
    category: 'khac', subject: null, grade: null, description: null,
    metadata: {}, createdAt: '2026-04-15T08:00:00Z', updatedAt: '2026-04-15T08:00:00Z',
  },
  {
    id: 'ur-002', userId: 'user-1', filename: 'tai_lieu_ham_so.docx',
    fileUrl: '/mock/ham_so.docx', fileSize: 1_200_000, pageCount: 8,
    contentText: 'Tài liệu bổ sung hàm số...', isEmbedded: false, isSystem: false,
    category: 'khac', subject: null, grade: null, description: null,
    metadata: {}, createdAt: '2026-04-10T14:00:00Z', updatedAt: '2026-04-10T14:00:00Z',
  },
];

// ────── Mock Messages ──────

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'msg-001', planId: 'plan-001', role: 'user',
    content: 'Thêm phần khởi động bằng trò chơi Kahoot', messageType: 'chat',
    attachedFiles: [], createdAt: '2026-04-20T10:10:00Z',
  },
  {
    id: 'msg-002', planId: 'plan-001', role: 'assistant',
    content: 'Tôi đã cập nhật phần khởi động với hoạt động Kahoot gồm 5 câu trắc nghiệm ôn bài cũ.',
    messageType: 'chat', attachedFiles: [], createdAt: '2026-04-20T10:10:30Z',
  },
];
