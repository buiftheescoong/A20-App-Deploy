### **Overview**

\- Tên sản phẩm: Soạn giáo án thông minh  
\- Mô tả ngắn: GV phổ thông soạn 5-8 giáo án/tuần, mỗi giáo án mất 1.5-2h. Chương trình GDPT 2018 yêu cầu format mới nhưng 40% GV chưa quen. Tổ trưởng bộ môn review thủ công 50+ giáo án/tháng. Xây dựng hệ thống có khả năng agent nhận: môn, lớp, bài, mục tiêu \-\> generate giáo án theo template chuẩn, support các mô hình: 5E, VNEN, 3 giai đoạn (theo Bộ GD&ĐT), gợi ý hoạt động dạy học, tài liệu, câu hỏi thảo luận phù hợp chủ đề, compliance checker: kiểm tra đủ thành phần ....  
\- Mục tiêu: giảm thời gian soạn giáo án và giảm tải cho tổ trưởng khi review.

### **Problem**

\- User đang gặp vấn đề gì?  
\+ GV phải soạn 5–8 giáo án/tuần, mỗi giáo án mất 1.5–2 giờ  
\+ Chương trình GDPT 2018 có format mới → 40% GV chưa quen  
\+ Tổ trưởng bộ môn phải review 50+ giáo án/tháng, thủ công → tốn thời gian, dễ thiếu sót  
\- Pain points:  
\+ Tốn thời gian, lặp lại  
\+ Không đồng nhất format

### **Goals & Metrics**

\- Product Goals:  
\+ Tự động hóa việc soạn giáo án  
\+ Chuẩn hóa format theo GDPT 2018  
\+ Giảm tải review thủ công  
\- Metrics:  
\+ Thời gian soạn giáo án giảm ≥ 96% (từ 120 phút/1 giáo án xuống còn khoảng 3-5 phút)  
\+ % giáo án đạt chuẩn ngay lần đầu ≥ 80%  
\+ Thời gian review giảm ≥ 70%

### **Target Users**

\- Giáo viên phổ thông (Tiểu học, THCS, THPT)  
\- Tổ trưởng bộ môn

### **User Stories**

\- Giáo viên muốn sinh giáo án tự động theo chuẩn GDPT 2018 và nội dung chính xác theo bài học để tiết kiệm thời gian.  
\- Tổ trưởng bộ môn muốn review giáo án của giáo viên có theo định dạng GDPT 2018 và nội dung có đúng không.

### **Functional Requirements**

#### Lesson Plan Generation

\- Mô tả: Người dùng nhập các thông tin bắt buộc gồm: môn học, lớp, bài học, mục tiêu bài học và lựa chọn mô hình dạy học (5E, VNEN hoặc 3 giai đoạn theo Bộ GD&ĐT). Ngoài ra có thể cung cấp thêm tài liệu tham khảo.  
   Hệ thống sử dụng kiến trúc Multi-Agent để:

+ Phân tích và trích xuất thông tin từ tài liệu đầu vào (nếu có)  
+ Sinh giáo án theo mô hình dạy học đã chọn  
+ Kiểm tra mức độ tuân thủ chuẩn GDPT 2018

   Quy trình này được thực hiện lặp (iteration loop) giữa các agent (generator – reviewer – checker) cho đến khi:

+ Giáo án đạt yêu cầu theo chuẩn GDPT 2018, hoặc  
+ Hết thời gian (timeout)

   Kết quả cuối cùng được xuất ra dưới dạng file .docx và .pdf.

\- Input:

+ Môn học  
+ Lớp  
+ Bài học  
+ Mục tiêu bài học  
+ Tài liệu tham khảo (tùy chọn)  
+ Mô hình dạy học (5E / VNEN / 3 giai đoạn)

\- Output:

+ Giáo án đạt chuẩn GDPT 2018  
+ Định dạng: .docx, .pdf

 

#### Compliance Checker 

\- Mô tả: Hệ thống tiếp nhận giáo án do người dùng cung cấp (hoặc do hệ thống sinh ra) và thực hiện kiểm tra mức độ tuân thủ theo chuẩn chương trình GDPT 2018\.  
  Quá trình kiểm tra bao gồm:

+ Đánh giá cấu trúc giáo án (mục tiêu, hoạt động, đánh giá, phương pháp, v.v.)  
+ Kiểm tra tính đầy đủ và logic của nội dung  
+ Đối chiếu với tiêu chí chuẩn GDPT 2018

  Kết quả trả về bao gồm trạng thái đạt/không đạt và chỉ rõ các phần thiếu, sai hoặc cần cải thiện.  
\- Input:

+ Giáo án (định dạng .docx hoặc .pdf)

\- Output:

+ Trạng thái: Passed / Failed  
+ Danh sách các lỗi hoặc phần chưa đạt  
+ Gợi ý chỉnh sửa (nếu có)

#### Lesson Plan Editing

\- Mô tả: Người dùng cung cấp giáo án hiện có kèm theo yêu cầu chỉnh sửa (ví dụ: thay đổi mục tiêu, điều chỉnh hoạt động, thêm nội dung, đổi phương pháp dạy học,...).  
   Hệ thống sẽ:

+ Phân tích yêu cầu chỉnh sửa  
+ Cập nhật nội dung giáo án tương ứng  
+ Đồng thời đảm bảo giáo án sau chỉnh sửa vẫn tuân thủ chuẩn GDPT 2018 thông qua bước kiểm tra tự động

   Nếu cần, hệ thống có thể lặp lại quá trình chỉnh sửa – kiểm tra để tối ưu kết quả.  
\- Input:

+ Giáo án (định dạng .docx hoặc .pdf)  
+ Yêu cầu chỉnh sửa từ giáo viên

\- Output:

+ Giáo án đã được chỉnh sửa theo yêu cầu  
+ Đảm bảo đúng chuẩn GDPT 2018  
+ Định dạng: .docx, .pdf

### **Non-functional Requirements**

-  Response time: 3-5p / generate  
-  Scale: 1k+ GV  
-  Security: bảo mật dữ liệu giáo án  
-  AI output phải ổn định, tránh hallucination nghiêm trọng:  
  * RAG Accuracy: 95% thông tin về kiến thức chuyên môn (ví dụ: công thức Toán, sự kiện Lịch sử) phải trích xuất đúng từ Sách giáo khoa chính thống.  
  * Template Adherence: 100% giáo án xuất ra phải có đủ các thẻ Heading theo quy định của Bộ

### **User Flow**

Flow chính:

- GV nhập thông tin bài học, tài liệu (nếu có)  
- Chọn mô hình (5E / VNEN / 3-phase)  
- AI generate giáo án  
- Compliance checker chạy  
- GV yêu chỉnh sửa (nếu cần)  
- Export

### **Scope**

#### In-scope

- Generate giáo án  
- Compliance checker  
- Chỉnh sửa giáo án theo yêu cầu

Out-of-scope

- Tích hợp LMS  
- Cá nhân hóa theo từng học sinh

### **Risks & Assumptions**

#### Risks

- Sai kiến thức   
- AI generate sai format  
- Nội dung không phù hợp thực tế lớp học, nội dung chưa đủ tốt

#### Assumptions

- Có template chuẩn từ Bộ GD&ĐT  
- GV có thể chỉnh sửa output AI

