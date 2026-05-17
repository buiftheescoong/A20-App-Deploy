'use client';

import { Suspense } from 'react';
import SmartForm from '@/components/generate/SmartForm';

export default function GeneratePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Soạn Giáo Án Mới</h1>
        <p className="text-gray-500">Điền thông tin bên dưới để AI tạo giáo án cho bạn</p>
      </div>
      <Suspense fallback={<div className="text-center py-20 text-gray-400">Đang tải...</div>}>
        <SmartForm />
      </Suspense>
    </div>
  );
}
