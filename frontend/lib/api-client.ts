import { 
  GenerateResponse, 
  StatusResponse, 
  LessonPlanResponse, 
  ClarificationResponse 
} from "./types";
import { MOCK_LESSON_PLAN } from "./mock-data";

/**
 * API Client with Mocking Support
 * Set NEXT_PUBLIC_USE_MOCK=true in .env.local to use mock data
 */

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function fetcher<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // 1. Bắt đầu tạo giáo án
  generateLessonPlan: async (data: any): Promise<GenerateResponse> => {
    if (USE_MOCK) {
      await new Promise(res => setTimeout(res, 1000));
      return { task_id: "mock-task-id", status: "pending" };
    }
    return fetcher<GenerateResponse>("/api/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // 2. Theo dõi trạng thái
  getStatus: async (taskId: string): Promise<StatusResponse> => {
    if (USE_MOCK && taskId === "mock-task-id") {
      await new Promise(res => setTimeout(res, 500));
      return {
        task_id: taskId,
        status: "completed",
        progress_step: "completed",
        lesson_plan_id: "mock-plan-id",
        clarification_needed: false,
        is_blank_template: false,
      };
    }
    return fetcher<StatusResponse>(`/api/status/${taskId}`);
  },

  // 3. Lấy chi tiết giáo án
  getLessonPlan: async (id: string): Promise<LessonPlanResponse> => {
    if (USE_MOCK && id === "mock-plan-id") {
      return {
        id: id,
        subject: "Toán",
        grade: "10",
        topic: "Hàm số bậc nhất",
        teaching_model: "5E",
        objectives: ["Mục tiêu mẫu"],
        content_json: MOCK_LESSON_PLAN,
        compliance_status: "PASSED",
        is_blank_template: false,
        status: "completed",
        created_at: new Date().toISOString(),
      };
    }
    return fetcher<LessonPlanResponse>(`/api/lesson-plans/${id}`);
  },

  // 4. Lấy câu hỏi clarifying
  getClarification: async (taskId: string): Promise<ClarificationResponse> => {
    if (USE_MOCK) {
      return {
        task_id: taskId,
        questions: ["Bạn có thể mô tả rõ hơn về đối tượng học sinh của mình không?"],
      };
    }
    return fetcher<ClarificationResponse>(`/api/clarification/${taskId}`);
  }
};
