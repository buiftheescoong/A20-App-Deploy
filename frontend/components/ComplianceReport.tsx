"use client";

interface ComplianceReportProps {
  isPassed: boolean;
  errors: Array<{
    section: string;
    issue: string;
    suggestion?: string;
  }>;
  suggestions: string[];
}

const CHECK_ITEMS = [
  "Thông tin bìa (Tên bài, Môn, Lớp, Thời gian)",
  "Mục tiêu (≥ 2 năng lực + 1 phẩm chất)",
  "Thiết bị và học liệu",
  "Đủ các bước/hoạt động theo mô hình",
  "Mỗi hoạt động có 4 cột (Mục tiêu – Nội dung – Sản phẩm – Tổ chức)",
];

export default function ComplianceReport({
  isPassed,
  errors,
  suggestions,
}: ComplianceReportProps) {
  // Map errors to check items
  const errorSections = new Set(errors.map((e) => e.section));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
      {/* Status Header */}
      <div
        className={`p-6 ${
          isPassed
            ? "bg-gradient-to-r from-green-500 to-emerald-600"
            : "bg-gradient-to-r from-red-500 to-pink-600"
        } text-white`}
      >
        <div className="flex items-center gap-3">
          <div className="text-4xl">{isPassed ? "✅" : "❌"}</div>
          <div>
            <h3 className="text-xl font-bold">
              {isPassed ? "PASSED — Đạt chuẩn GDPT 2018" : "FAILED — Cần chỉnh sửa"}
            </h3>
            <p className="opacity-90 text-sm mt-1">
              {isPassed
                ? "Giáo án đáp ứng đầy đủ yêu cầu theo chuẩn Bộ GD&ĐT"
                : `Phát hiện ${errors.length} vấn đề cần khắc phục`}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Check Items */}
        <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">
          Danh sách kiểm tra
        </h4>
        <div className="space-y-2">
          {CHECK_ITEMS.map((item, i) => {
            const hasError = errors.some(
              (e) =>
                e.issue.toLowerCase().includes(item.toLowerCase().substring(0, 10))
            );
            return (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  hasError
                    ? "bg-red-50 border-red-100"
                    : "bg-green-50 border-green-100"
                }`}
              >
                <span className="text-lg">{hasError ? "❌" : "✅"}</span>
                <span
                  className={`text-sm ${
                    hasError ? "text-red-700" : "text-green-700"
                  }`}
                >
                  {item}
                </span>
              </div>
            );
          })}
        </div>

        {/* Detailed Errors */}
        {errors.length > 0 && (
          <div className="mt-6">
            <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wider mb-3">
              Chi tiết lỗi
            </h4>
            <div className="space-y-3">
              {errors.map((err, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl bg-red-50 border border-red-100"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 font-bold text-xs bg-red-100 px-2 py-0.5 rounded">
                      {err.section}
                    </span>
                    <div>
                      <p className="text-sm text-red-700 font-medium">
                        {err.issue}
                      </p>
                      {err.suggestion && (
                        <p className="text-sm text-red-500 mt-1">
                          💡 <span className="italic">{err.suggestion}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
