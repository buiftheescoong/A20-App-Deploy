# Lesson Plan Template

Use this Markdown reference to generate Vietnamese lesson plans. Replace all placeholders with real content before export. Do not include administrative labels, template names, or unresolved placeholders in the final lesson plan. The lesson plan must begin directly with the lesson title and duration.

## Generation Inputs

These values are provided by the system or user and must guide generation:

- `{{subject}}`
- `{{grade}}`
- `{{lesson_title}}`
- `{{duration}}`
- `{{teaching_model}}`: one of `3 giai đoạn`, `5E`, `VNEN`
- `{{lesson_objectives_from_database}}`
- `{{reference_materials}}`
- `{{available_equipment}}`
- `{{class_context}}`

## Teaching Model Phase Map

Choose the activity sequence based on `{{teaching_model}}`. Do not only rename headings; the content of each activity must match the purpose of the selected phase.

### `3 giai đoạn`

Use this sequence:

1. Khởi động / Xác định vấn đề / Xác định nhiệm vụ học tập
2. Hình thành kiến thức mới
3. Luyện tập
4. Vận dụng

### `5E`

Use this sequence:

1. Engage / Gắn kết, khơi gợi vấn đề
2. Explore / Khám phá
3. Explain / Giải thích, hình thành kiến thức
4. Elaborate / Mở rộng, vận dụng
5. Evaluate / Đánh giá

### `VNEN`

Use this sequence:

1. Khởi động
2. Hình thành kiến thức
3. Luyện tập
4. Vận dụng
5. Tìm tòi, mở rộng

## Output Template

## `{{lesson_title}}`

`(thời lượng: {{duration}})`

## I. Mục tiêu / Lesson objectives

### 1. Năng lực / Competencies

#### Năng lực `{{subject}}` / Subject-specific competency

Use `{{lesson_objectives_from_database}}` as the primary source for the subject-specific competency. Rewriting for clarity is allowed, but the meaning and scope of database objectives must not be changed.

- `{{subject_competency_1}}`
- `{{subject_competency_2}}`
- `{{subject_competency_3}}`

#### Năng lực chung / General competences

Describe general competencies through observable actions in the lesson. Do not only list competency names.

- Năng lực tự học: `{{self_learning_competency_expression}}`
- Năng lực giải quyết vấn đề: `{{problem_solving_competency_expression}}`
- Năng lực giao tiếp và hợp tác: `{{communication_collaboration_competency_expression}}`

### 2. Phẩm chất / Qualities / Character

Describe qualities through concrete expressions, questions, situations, or learning tasks.

- `{{quality_expression_1}}`
- `{{quality_expression_2}}`
- `{{quality_expression_3}}`

## II. Phương pháp dạy học, kĩ thuật dạy học / Teaching methods, teaching techniques

- Phương pháp dạy học: `{{teaching_methods}}`
- Kĩ thuật dạy học: `{{teaching_techniques}}`

## III. Thiết bị dạy học và học liệu / Learning equipment and materials

- Thiết bị dạy học: `{{learning_equipment}}`
- Học liệu: `{{learning_materials}}`
- Tài liệu tham khảo sử dụng trong bài: `{{reference_materials_used_in_lesson}}`

## IV. Tiến trình dạy học / Process of organizing teaching activities

Generate one activity for each phase in the selected teaching model. Each activity must include:

- `a) Mục tiêu / Objective`
- `b) Sản phẩm / Products`
- `c) Tổ chức thực hiện / Implementation organization`
- activity duration
- classroom organization format such as cá nhân, cặp đôi, nhóm nhỏ, nhóm lớn, cả lớp
- assessment method aligned with the activity objective and product

Activity 2 may include sub-activities such as `2.1`, `2.2` when needed. For a 45-minute lesson, avoid more than 3 sub-activities in Activity 2.

### `{{activity_number}}`. `{{activity_title_vi}}` / `{{activity_title_en}}`

`Thời lượng: {{activity_duration}}`  
`Hình thức tổ chức: {{classroom_organization}}`

#### a) Mục tiêu / Objective

`{{activity_objective}}`

#### b) Sản phẩm / Products

`{{activity_products}}`

#### c) Tổ chức thực hiện / Implementation organization

| Hoạt động của giáo viên / Teacher's activities | Hoạt động của học sinh / Students' activities |
|---|---|
| Chuyển giao nhiệm vụ học tập: `{{teacher_assign_task}}` | Tiếp nhận nhiệm vụ: `{{student_receive_task}}` |
| Thực hiện nhiệm vụ học tập: `{{teacher_support}}` | Thực hiện nhiệm vụ: `{{student_work}}` |
| Báo cáo thảo luận: `{{teacher_discussion}}` | Báo cáo thảo luận: `{{student_report}}` |
| Kết luận, nhận định: `{{teacher_conclusion}}` | Ghi nhận, hoàn thiện: `{{student_finalize}}` |

#### Phương án đánh giá / Assessment

- Hình thức đánh giá: `{{assessment_method}}`
- Căn cứ đánh giá: `{{assessment_evidence}}`
- Người thực hiện đánh giá: `{{assessment_actor}}`

#### Tiểu kết / Sub-conclusion

`{{activity_sub_conclusion}}`

#### Nội dung ghi vở cho học sinh

`{{activity_notebook_content}}`

Repeat the activity block for every phase required by `{{teaching_model}}`.

## Output Rules

- Do not leave placeholders such as `{{...}}`, ellipsis-only text, or empty required cells in the final output.
- Keep the heading order from `I` to `IV`.
- Keep bilingual labels where provided.
- Every activity must include objective, product, implementation organization, duration, classroom organization, and assessment.
- Every `Tổ chức thực hiện` section must use the 2-column table format above.
- The total activity duration must not exceed `{{duration}}`.
- Generated content must align with `{{lesson_objectives_from_database}}`.
- Teaching methods in section II must appear in relevant section IV activities.
- Equipment and materials in section III must be used in at least one activity when applicable.
- If reference materials are available, list the materials used in section III and ground lesson content in those materials.
