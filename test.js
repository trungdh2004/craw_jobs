import "dotenv/config";
import { analyzeJobWithMimo } from "./lib/mimo.js";

(async () => {
  const job = {
    source: "topcv",
    id: "2228624",
    title: "Chuyên Viên Phát Triển Frontend",
    company: "CÔNG TY CỔ PHẦN CÔNG NGHỆ UPBASE",
    wage: "15 - 30 triệu",
    experience: "2 năm",
    address:
      "- Hà Nội: Toà Centerpoint, Số 27 Lê Văn Lương, Phường Thanh Xuân (quận Thanh Xuân cũ)",
    label: "15 - 30 triệu, Hà Nội, 2 năm",
    urlDetail:
      "https://www.topcv.vn/viec-lam/chuyen-vien-phat-trien-frontend/2228624.html?ta_source=JobSearchList_LinkDetail&u_sr_id=NRbk5JLAaGT4nKJJadQ47U5Cb1OMiYn11kbyxA0G_1783570482",
    urlCompany:
      "https://www.topcv.vn/cong-ty/cong-ty-co-phan-cong-nghe-upbase/46641.html",
    description: [
      {
        title: "Mô tả công việc",
        items: [
          "UpBase là Tech-Driven eCommerce Enabler hàng đầu tại Việt Nam và khu vực – Công ty công nghệ đồng hành cùng các thương hiệu và nhà bán lẻ trong hành trình chuẩn hóa, tự động hóa và tăng trưởng trên thương mại điện tử.",
          "Front-end Developer đóng vai trò trực tiếp xây dựng và tối ưu trải nghiệm người dùng cho các sản phẩm SaaS trong lĩnh vực E-commerce. Vị trí này phối hợp chặt chẽ với Product Owner, UX/UI và Back-end để đảm bảo sản phẩm được phát triển đúng định hướng, nhất quán và tạo giá trị thực tế cho người dùng và hoạt động kinh doanh. Cụ thể:- Tham gia vào một nhóm phát triển sản phẩm theo quy trình Agile/Scrum, luôn thay đổi và học tập để xây dựng các sản phẩm tốt nhất mang lại giá trị cho người dùng.- Làm việc với PO, Tech Lead và các thành viên khác trong team để phát triển sản phẩm theo mô hình Agile Scrum.- Liên tục cải thiện chất lượng codebase, đảm bảo code clean và reusable với unit / functional tests- Thực hiện các công việc khác được phân công theo yêu cầu của tech lead.",
          "UpBase Tech StackInfrastructure: Container, K8SCI/CD: Docker, Github Action.API: GraphQLFrontend: NextJS, ReactJS, ReactNative,",
        ],
      },
      {
        title: "Yêu cầu ứng viên",
        items: [
          "Kinh nghiệm & Kiến thức:",
          "Tốt nghiệp các chuyên ngành Công nghệ thông tin, Kỹ thuật Phần mềm hoặc các ngành liên quan.",
          "Có tối thiểu 2 năm kinh nghiệm Front-end, trong đó có ít nhất 1 năm làm việc với một trong các framework: ReactJS, NextJS.",
          "Có khả năng đọc hiểu tài liệu kỹ thuật bằng tiếng Anh.",
          "Kỹ năng:",
          "Có tư duy logic tốt, khả năng tiếp cận và xử lý vấn đề một cách mạch lạc.",
          "Linh hoạt, nhanh nhẹn trong công việc, có khả năng thích ứng và xử lý tình huống.",
          "Thái độ & Tư duy:",
          "Chăm chỉ, tỉ mỉ, chú trọng chất lượng sản phẩm.",
          "Ham học hỏi, hứng thú tìm hiểu và cập nhật các kỹ thuật, công nghệ mới trong lĩnh vực Front-end.",
          "Khả năng làm việc nhóm tốt.",
        ],
      },
      {
        title: "Quyền lợi",
        items: [
          "Tổng thu nhập: 15.000.000 - 30.000.000 VNĐ/tháng, thoả thuận trong buổi phỏng vấn/ offer.",
          "Được triển khai thực chiến và được phép thất bại:",
          "Trực tiếp làm việc và phối hợp đa phòng ban (Product, Business, Vận hành, Marketing…), giúp hiểu sâu bài toán kinh doanh và nâng cao năng lực xây dựng giải pháp công nghệ thực tế.",
          "Cơ hội tiếp cận và triển khai các nền tảng, công nghệ mới, tham gia vào các dự án hợp tác với đối tác và nền tảng lớn trong lĩnh vực TMĐT & công nghệ.",
          "Tham gia xây dựng và phát triển sản phẩm/công nghệ phục vụ các nhãn hàng Việt Nam trong quá trình mở rộng ra thị trường khu vực.",
          "Quyền lợi khác:",
          "Thưởng tháng lương 13++ (theo tình hình sản xuất kinh doanh), Thưởng hiệu suất, thưởng dự án.",
          "Chính sách ESOP: Dành cho nhân sự gắn bó, key và có đóng góp nổi bật",
          "Cơ hội thăng tiến minh bạch, review định kỳ nâng lương/level sau 3-6 tháng.",
          "Chế độ phúc lợi đầy đủ: BHXH, BHYT, BHTN theo quy định, Khám sức khỏe định kì hàng năm cho CBNV",
          "Được tham gia các lớp học (Hard Skills, Soft Skills) giảng dạy bởi chuyên gia và học tập online trong hệ thống bài giảng LMS do công ty tổ chức.",
          "Môi trường làm việc Gen Z trẻ trung, năng động, chuyên nghiệp, hoạt động nội bộ đa dạng: Team Building 2 lần/ năm, Warm-up hàng tháng, Happy Hour hàng tuần, CLB thể thao,...",
          "Chế độ làm việc: 5 ngày/tuần, nghỉ Thứ 7 và Chủ Nhật.",
        ],
      },
      {
        title: "Thời gian làm việc",
        items: ["Thứ 2 - Thứ 6 (từ 08:00 đến 17:30)"],
      },
    ],
    is_AI: false,
    create_at: 1783570488895,
  };

  const cv = {
    name: "Đỗ Hữu Trung",
    skills: [
      "JavaScript",
      "TypeScript",
      "React",
      "Vue.js",
      "Node.js",
      "HTML5",
      "CSS3",
      "Tailwind CSS",
      "Git",
      "REST API",
      "Responsive Design",
    ],
    experience: "Frontend Developer, 2+ years experience with React and Vue.js",
    education: "University degree in Computer Science / IT",
    preferredLocations: ["Hà Nội"],
    preferredSalary: "15-30 triệu",
    summary:
      "Frontend developer with 2+ years of experience building web applications using React, Vue.js, and TypeScript. Skilled in responsive design, API integration, and modern frontend toolchains.",
  };
  const data = await analyzeJobWithMimo(job, cv);

  console.log("MiMo Analysis Result:", data);
})();
