import { LessonPlanJSON } from "./types";

export const MOCK_LESSON_PLAN: LessonPlanJSON = {
  metadata: {
    subject: "Toán",
    grade: "10",
    topic: "Hàm số bậc nhất",
    teaching_model: "5E",
    duration_minutes: 45,
    objectives: [
      "Học sinh nhận diện được dạng của hàm số bậc nhất y = ax + b (a ≠ 0)",
      "Vẽ được đồ thị của hàm số bậc nhất",
      "Vận dụng vào giải các bài tập thực tế đơn giản"
    ],
    competencies: ["Tư duy và lập luận toán học", "Giải quyết vấn đề toán học"],
    materials: ["Sách giáo khoa Toán 10", "Thước kẻ", "Máy tính cầm tay"]
  },
  sections: {
    engage: {
      title: "Khởi động (Engage)",
      content: "GV đưa ra tình huống thực tế về quãng đường đi được của một xe chuyển động thẳng đều. Yêu cầu HS thiết lập công thức tính quãng đường theo thời gian.",
      duration: 5
    },
    explore: {
      title: "Khám phá (Explore)",
      content: "HS quan sát các ví dụ về hàm số bậc nhất, thảo luận về điều kiện của hệ số a. HS thực hiện vẽ thử đồ thị dựa trên bảng giá trị.",
      duration: 10
    },
    explain: {
      title: "Giải thích (Explain)",
      content: "GV chính xác hóa khái niệm hàm số bậc nhất. Hướng dẫn các bước vẽ đồ thị (tìm 2 điểm cực trị hoặc 2 điểm bất kỳ).",
      duration: 15
    },
    elaborate: {
      title: "Vận dụng (Elaborate)",
      content: "HS thực hành vẽ đồ thị y = 2x + 1 và y = -x + 3. So sánh độ dốc của hai đường thẳng.",
      duration: 10
    },
    evaluate: {
      title: "Đánh giá (Evaluate)",
      content: "GV tổng kết bài học thông qua trò chơi trắc nghiệm ngắn trên phần mềm hoặc phiếu bài tập.",
      duration: 5
    }
  },
  rag_sources: ["sgk_toan_10_chuong2_p15"],
  compliance: {
    status: "PASSED",
    errors: []
  },
  clarification_needed: false
};

export const MOCK_STATUS_UPDATES = [
  { step: "intake_done", label: "Đã phân tích yêu cầu" },
  { step: "rag_done", label: "Đã tra cứu dữ liệu từ SGK" },
  { step: "generating", label: "Đồ họa đang soạn thảo nội dung..." },
  { step: "quality_done", label: "Kiểm tra chất lượng hoàn tất" },
  { step: "completed", label: "Giáo án đã sẵn sàng!" }
];
