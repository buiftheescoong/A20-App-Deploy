# Chương 9: MỘT SỐ YẾU TỐ XÁC SUẤT

Trong chương này, chúng ta sẽ sử dụng tỉ số để mô tả xác suất của một biến cố ngẫu nhiên trong một số tình huống thường gặp. Chúng ta cũng sẽ tìm hiểu mối liên hệ giữa xác suất thực nghiệm của một biến cố với xác suất của biến cố trong một số phép thử đơn giản và ứng dụng vào một số bài toán ước lượng số phần tử của một tập hợp.

Khả năng mũi tên chỉ vào ô ghi số lớn hơn 50 trên vòng quay may mắn này là bao nhiêu?

## Bài 1: MÔ TẢ XÁC SUẤT BẰNG TỈ SỐ

Một hộp có 1 quả bóng xanh và 4 quả bóng đỏ có kích thước và khối lượng như nhau. Châu lấy ra ngẫu nhiên 1 quả bóng từ hộp. Theo em, khả năng Châu lấy được bóng đỏ bằng mấy lần khả năng lấy được bóng xanh?

### 1. KẾT QUẢ THUẬN LỢI

Một hộp chứa 10 tấm thẻ cùng loại được đánh số lần lượt từ 3 đến 12. Chọn ra ngẫu nhiên 1 thẻ từ hộp. Hãy liệt kê các kết quả làm cho mỗi biến cố sau xảy ra:
A: “Số ghi trên thẻ lấy ra chia hết cho 3";
B: “Số ghi trên thẻ lấy ra chia hết cho 6".

Ta thấy nếu lấy được thẻ ghi số 3 thì biến cố A xảy ra nhưng biến cố B không xảy ra. Khi đó ta nói kết quả lấy được thẻ ghi số 3 là thuận lợi cho biến cố A và kết quả lấy được thẻ ghi số 3 không thuận lợi cho biến cố B.

Trong một phép thử, mỗi kết quả làm cho một biến cố xảy ra được gọi là một kết quả thuận lợi cho biến cố đó.

**Ví dụ 1.** Trong phép thử lấy thẻ ở xét các biến cố sau:
C: “Số ghi trên thẻ là số nguyên tố";
D: “Số ghi trên thẻ là số lẻ”.
Hãy nêu các kết quả thuận lợi cho mỗi biến cố C và D.

**Giải**
Các kết quả thuận lợi cho biến cố C là lấy được thẻ ghi số 3; 5; 7; 11.
Các kết quả thuận lợi cho biến cố D là lấy được thẻ ghi số 3; 5; 7; 9; 11.

**Thực hành 1.**
Trên bàn có một tấm bìa hình tròn được chia thành 8 hình quạt bằng nhau và được đánh số từ 1 đến 8 như Hình 1. Xoay tấm bìa quanh tâm hình tròn và xem khi tấm bìa dừng lại, mũi tên chỉ vào ô ghi số nào.
Xét các biến cố sau:
A: “Mũi tên chỉ vào ô ghi số chẵn”;
B: “Mũi tên chỉ vào ô ghi số chia hết cho 4";
C: “Mũi tên chỉ vào ô ghi số nhỏ hơn 3".
Hãy nêu các kết quả thuận lợi cho mỗi biến cố trên.

### 2. MÔ TẢ XÁC SUẤT BẰNG TỈ SỐ

Gieo một con xúc xắc cân đối và đồng chất. Gọi A là biến cố gieo được mặt có số chấm chia hết cho 3. Tính xác suất của biến cố A.

Trong phép thử trên, ta thấy:
– Có 6 kết quả có thể xảy ra.
– Vì con xúc xắc là cân đối và đồng chất nên 6 kết quả có cùng xác suất xảy ra là $\frac{1}{6}.$
Khi gieo được mặt 3 chấm hoặc 6 chấm thì biến cố A xảy ra nên xác suất của biến cố A là $P(A)=\frac{2}{6}=\frac{1}{3}.$

Khi tất cả các kết quả của một trò chơi hay phép thử nghiệm đều có khả năng xảy ra bằng nhau thì xác suất xảy ra của biến cố A là tỉ số giữa số kết quả thuận lợi cho A và tổng số kết quả có thể xảy ra của phép thử, tức là:
$P(A)=\frac{S\hat{o}~k\hat{e}t~qu\hat{a}~thu\hat{a}n~loi~cho~A}{T\hat{o}ng~s\hat{o}~k\hat{e}t~qu\hat{a}~co~th\hat{e}~x\hat{a}y~ra}.$

Để phân biệt với xác suất thực nghiệm, xác suất P(A) xác định ở công thức trên còn được gọi là xác suất lí thuyết của biến cố A.

**Ví dụ 2.** Trong phép thử gieo một con xúc xắc, tính xác suất của các biến cố sau:
A: “Gieo được mặt có số chấm là số lẻ";
B: “Gieo được mặt có nhiều hơn 3 chấm”.

**Giải**
Vì xúc xắc cân đối và đồng chất nên 6 kết quả của phép thử có khả năng xảy ra bằng nhau.
Biến cố A xảy ra khi gieo được mặt có 1; 3 hoặc 5 chấm nên có 3 kết quả thuận lợi cho A. Xác suất của biến cố A là $P(A)=\frac{3}{6}=\frac{1}{2}.$
Biến cố B xảy ra khi gieo được mặt có 4; 5 hoặc 6 chấm nên có 3 kết quả thuận lợi cho B. Xác suất của biến cố B là $P(B)=\frac{3}{6}=\frac{1}{2}.$

**Chú ý:** A và B là hai biến cố khác nhau nhưng có xác suất xảy ra bằng nhau. Ta nói A và B là hai biến cố đồng khả năng.

**Thực hành 2.** Hãy trả lời câu hỏi ở phần khởi đầu.

**Ví dụ 3.** Tỉ lệ thành viên nữ của một câu lạc bộ nghệ thuật là 60%. Tổng số thành viên của câu lạc bộ là 25 người.
a) Gặp ngẫu nhiên 1 thành viên của câu lạc bộ, tính xác suất thành viên đó là nữ.
b) Em có nhận xét gì về tỉ lệ thành viên nữ và xác suất trên?

**Giải**
Ta thấy khả năng gặp mỗi thành viên của câu lạc bộ là như nhau.
a) Số thành viên nữ của câu lạc bộ là $25 \cdot 60\% = 15$ (người).
Xác suất gặp được thành viên nữ là $\frac{15}{25}=\frac{3}{5}.$
b) Tỉ lệ thành viên nữ của câu lạc bộ là $60\%=\frac{60}{100}=\frac{3}{5}$, do đó tỉ lệ thành viên nữ của câu lạc bộ đúng bằng xác suất gặp ngẫu nhiên một thành viên nữ của câu lạc bộ đó.

**Vận dụng.**
Một khu phố có 200 người lao động, mỗi người làm việc ở một trong năm lĩnh vực là Kinh doanh, Sản xuất, Giáo dục, Y tế và Dịch vụ. Biểu đồ trong Hình 2 thống kê tỉ lệ người lao động thuộc mỗi lĩnh vực nghề nghiệp.
Gặp ngẫu nhiên một người lao động của khu phố.
a) Tính xác suất người đó có công việc thuộc lĩnh vực Giáo dục.
b) Tính xác suất người đó có công việc không thuộc lĩnh vực Y tế hay Dịch vụ.

### BÀI TẬP

1. Trong hộp có 5 quả bóng có kích thước và khối lượng giống nhau và được đánh số lần lượt là 5; 8; 10; 13; 16. Lấy ra ngẫu nhiên 1 quả bóng từ hộp. Tính xác suất của các biến cố:
   A: “Số ghi trên quả bóng là số lẻ”;
   B: “Số ghi trên quả bóng chia hết cho 3";
   C: “Số ghi trên quả bóng lớn hơn 4”.

2. Một hộp chứa 3 viên bi xanh, 4 viên bi đỏ và 5 viên bi vàng có kích thước và khối lượng giống nhau. Lấy ra ngẫu nhiên 1 viên bi từ hộp. Tính xác suất của các biến cố:
   A: “Viên bi lấy ra có màu xanh";
   B: “Viên bi lấy ra không có màu đỏ”.

3. Trong hộp có 10 tấm thẻ cùng loại, trên mỗi thẻ có ghi một số tự nhiên. Lấy ra ngẫu nhiên 1 thẻ từ hộp. Biết rằng xác suất lấy được thẻ ghi số chẵn gấp 4 lần xác suất lấy được thẻ ghi số lẻ. Hỏi trong hộp có bao nhiêu thẻ ghi số lẻ?

4. Số lượng học sinh tham gia Câu lạc bộ Cờ vua của một trường được biểu diễn ở biểu đồ. Chọn ngẫu nhiên 1 học sinh trong Câu lạc bộ Cờ vua của trường đó. Tính xác suất của các biến cố:
   A: “Học sinh được chọn là nữ";
   B: “Học sinh được chọn học lớp 8";
   C: “Học sinh được chọn là nam và không học lớp 7".

5. Một trường trung học cơ sở có 600 học sinh. Tỉ lệ phần trăm học sinh mỗi khối lớp được cho ở biểu đồ trong Hình 4. Chọn ngẫu nhiên một học sinh trong trường để đi dự phỏng vấn. Biết rằng mọi học sinh của trường đều có khả năng được lựa chọn như nhau.
   a) Tính xác suất của biến cố “Học sinh được chọn thuộc khối 9".
   b) Tính xác suất của biến cố “Học sinh được chọn không thuộc khối 6".

## Bài 2: XÁC SUẤT LÍ THUYẾT VÀ XÁC SUẤT THỰC NGHIỆM

Trước khi Hà tung một đồng xu cân đối và đồng chất 100 lần, Thọ dự đoán sẽ có trên 70 lần xuất hiện mặt sấp còn Thuỷ lại dự đoán sẽ có ít hơn 70 lần xuất hiện mặt sấp. Theo em, bạn nào có khả năng đoán đúng cao hơn? Vì sao?

Một hộp kín chứa 3 quả bóng xanh và 2 quả bóng đỏ có cùng kích thước và khối lượng. An lấy ra ngẫu nhiên 1 quả bóng từ hộp, xem màu rồi trả lại hộp.

a) Tính tỉ số mô tả xác suất lí thuyết của biến cố “An lấy được bóng xanh".
b) Sau khi lập lại phép thử đó 100 lần, An ghi lại số lần mình lấy được bóng xanh sau 20; 40; 60; 80 và 100 lần lấy bóng như sau:

| Số lần lấy bóng | 20 | 40 | 60 | 80 | 100 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Số lần lấy được bóng xanh | 9 | 20 | 32 | 46 | 59 |

Tính các xác suất thực nghiệm của sự kiện “An lấy được bóng xanh sau 20; 40; 60; 80 và 100 lần thử.

Ta thấy:
– Xác suất thực nghiệm phụ thuộc vào kết quả của dãy phép thử và chỉ được xác định sau khi đã thực hiện dãy phép thử.
– Xác suất lí thuyết có thể được xác định trước khi thực hiện phép thử.
Xác suất thực nghiệm và xác suất lí thuyết của cùng một sự kiện hay biến cố không nhất thiết là bằng nhau. Tuy nhiên, khi thực hiện càng nhiều lần phép thử, xác suất thực nghiệm càng gần xác suất lí thuyết.

Gọi $P(A)$ là xác suất xuất hiện biến cố A khi thực hiện một phép thử.
Gọi $n(A)$ là số lần xuất hiện biến cố A khi thực hiện phép thử đó n lần.
Xác suất thực nghiệm của biến cố A là tỉ số $\frac{n(A)}{n}$.
Khi n càng lớn, xác suất thực nghiệm của biến cố A càng gần $P(A).$

**Ví dụ 1.** Mỗi bạn Trọng, Thuỷ và Khuê tung một đồng xu cân đối và đồng chất 20 lần và ghi lại kết quả ở bảng sau:

| Người tung | Số lần xuất hiện mặt sấp | Số lần xuất hiện mặt ngửa |
| :--- | :--- | :--- |
| Trọng | 13 | 7 |
| Thuỷ | 8 | 12 |
| Khuê | 11 | 9 |

Gọi A là biến cố “Xuất hiện mặt sấp".
a) Tính các xác suất thực nghiệm của biến cố A sau 20 lần tung của từng bạn.
b) Tính xác suất thực nghiệm của biến cố A sau 60 lần tung của cả 3 bạn.
c) Tính xác suất lí thuyết của biến cố A khi tung đồng xu. So sánh xác suất này với các xác suất thực nghiệm vừa tính, em có nhận xét gì?

**Giải**
a) Xác suất thực nghiệm của biến cố A sau 20 lần tung của Trọng là $\frac{13}{20}=0,65.$
Xác suất thực nghiệm của biến cố A sau 20 lần tung của Thuỷ là $\frac{8}{20}=0,4.$
Xác suất thực nghiệm của biến cố A sau 20 lần tung của Khuê là $\frac{11}{20}=0,55.$
b) Xác suất thực nghiệm của biến cố A sau 60 lần tung của cả ba bạn là $\frac{13+8+11}{60}=\frac{8}{15}\approx0,53$.
c) Do đồng xu là cân đối và đồng chất nên xác suất của biến cố A là $P(A)=\frac{1}{2}=0,5$.
**Nhận xét:** Xác suất thực nghiệm của biến cố A có thể lớn hơn hoặc nhỏ hơn xác suất lí thuyết. Khi số lần thực hiện phép thử lớn (60 lần) thì xác suất thực nghiệm của biến cố A là 0,53 gần bằng xác suất lí thuyết là 0,5.

**Ví dụ 2.** Ở một trang trại nuôi gà, người ta nhận thấy xác suất một quả trứng gà có cân nặng trên 42 g là 0,4. Hãy ước lượng xem trong một lô 2000 quả trứng gà của trang trại có khoảng bao nhiêu quả trứng có cân nặng trên 42 g.

**Giải**
Gọi N là số quả trứng gà có cân nặng trên 42 g trong lô 2000 quả trứng.
Xác suất thực nghiệm để một quả trứng có cân nặng trên 42 g là $\frac{N}{2000}$. Do số quả trứng trong lô là lớn nên $\frac{N}{2000}\approx0,4,$ tức là $N\approx2000 \cdot 0,4 = 800$.
Vậy có khoảng 800 quả trứng gà trong lô trứng trên có cân nặng trên 42 g.

**Thực hành 1.** Hãy trả lời câu hỏi ở đầu bài.

**Thực hành 2.** Một hộp chứa một số quả bóng xanh và bóng đỏ. Linh lấy ra ngẫu nhiên 1 quả bóng từ hộp, xem màu rồi trả bóng lại hộp. Lặp lại phép thử đó 200 lần, Linh thấy có 62 lần lấy được bóng xanh và 138 lần lấy được bóng đỏ.
a) Tính xác suất thực nghiệm của biến cố “Lấy được bóng xanh" sau 200 lần thử.
b) Biết số bóng xanh trong hộp là 20, hãy ước lượng số bóng đỏ trong hộp.

**Vận dụng.** Xác suất nảy mầm của một loại hạt giống là 0,8. Người ta đem gieo 1000 hạt giống đó. Hãy ước lượng xem có khoảng bao nhiêu hạt trong số đó sẽ nảy mầm.

### BÀI TẬP

1. Phương gieo một con xúc xắc 120 lần và thống kê lại kết quả các lần gieo ở bảng sau:

| Mặt | 1 chấm | 2 chấm | 3 chấm | 4 chấm | 5 chấm | 6 chấm |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Số lần xuất hiện | 21 | 24 | 8 | 5 | 18 | 44 |

Hãy tính xác suất thực nghiệm của biến cố “Gieo được mặt có số chấm là số lẻ" sau 120 lần thử trên.

2. Ở một sân bay người ta nhận thấy với mỗi chuyến bay, xác suất tất cả mọi người mua vé đều có mặt để lên máy bay là 0,9. Trong một ngày sân bay đó có 120 lượt máy bay cất cánh. Hãy ước lượng số chuyến bay trong ngày hôm đó có người mua vé nhưng không lên máy bay.

3. Một hộp chứa các viên bi màu trắng và đen có kích thước và khối lượng như nhau. Mai lấy ra ngẫu nhiên 1 viên bi từ hộp, xem màu rồi trả lại hộp. Lặp lại thử nghiệm đó 80 lần, Mai thấy có 24 lần lấy được viên bi màu trắng.
   a) Hãy tính xác suất thực nghiệm của biến cố “Lấy được viên bi màu đen” sau 80 lần thử.
   b) Biết tổng số bi trong hộp là 10, hãy ước lượng xem trong hộp có khoảng bao nhiêu viên bi trắng.

4. Trong một cuộc điều tra, người ta phỏng vấn 300 người được lựa chọn ngẫu nhiên ở một khu dân cư thì thấy có 255 người ủng hộ việc tắt đèn điện trong sự kiện Giờ Trái Đất. Hãy ước lượng xác suất của biến cố “Một người được lựa chọn ngẫu nhiên trong khu dân cư ủng hộ việc tắt đèn điện trong sự kiện Giờ Trái Đất".
