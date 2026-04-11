"use client";

import { useState } from "react";
import { exportDocx } from "@/lib/api";

interface ExportButtonProps {
  planId: string;
}

export default function ExportButton({ planId }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const result = await exportDocx(planId);
      if (result.download_url) {
        window.open(result.download_url, "_blank");
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert("Không thể xuất file. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="btn-primary !py-3 disabled:opacity-50"
      id="btn-export"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Đang xuất...
        </span>
      ) : (
        "📥 Tải DOCX"
      )}
    </button>
  );
}
