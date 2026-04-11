'use client';

import Link from 'next/link';

interface BlankTemplateAlertProps {
  taskId: string;
  onRetry: () => void;
}

export default function BlankTemplateAlert({ taskId, onRetry }: BlankTemplateAlertProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden animate-fade-in">
      {/* Warning Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="text-4xl">⚠️</div>
          <div>
            <h3 className="text-xl font-bold">Template trắng đã được chuẩn bị</h3>
            <p className="opacity-90 text-sm mt-1">
              Hệ thống không thể tạo nội dung tự động lần này
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-amber-800 text-sm leading-relaxed">
            Do lỗi kỹ thuật hoặc hết thời gian xử lý, chúng tôi đã chuẩn bị sẵn một{' '}
            <strong>template giáo án trắng</strong> theo đúng format chuẩn GDPT 2018. Bạn có thể tải
            về và tự điền nội dung.
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h4 className="font-semibold text-gray-700 text-sm mb-2">Hướng dẫn sử dụng template:</h4>
          <ul className="text-sm text-gray-600 space-y-1.5">
            <li className="flex items-start gap-2">
              <span>1️⃣</span>
              <span>Tải file DOCX template trắng về máy</span>
            </li>
            <li className="flex items-start gap-2">
              <span>2️⃣</span>
              <span>Mở file bằng Microsoft Word hoặc Google Docs</span>
            </li>
            <li className="flex items-start gap-2">
              <span>3️⃣</span>
              <span>Điền nội dung vào các mục đã có sẵn heading</span>
            </li>
            <li className="flex items-start gap-2">
              <span>4️⃣</span>
              <span>Quay lại đây để kiểm tra compliance khi đã hoàn thành</span>
            </li>
          </ul>
        </div>

        <div className="flex gap-4 pt-2">
          <a
            href={`#download-template`}
            className="btn-primary flex-1 text-center"
            id="btn-download-template"
          >
            📥 Tải template về
          </a>
          <button onClick={onRetry} className="btn-secondary flex-1" id="btn-retry">
            🔄 Thử lại
          </button>
        </div>
      </div>
    </div>
  );
}
