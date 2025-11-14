import mongoose from 'mongoose'
import CredentialType from '../src/models/credential-type.model'
import { config } from '../src/utils/env'
import { connectDB } from '../src/config/db'

const credentialTypesData = [
  { "id": "vn_cccd_chip", "name": "Căn cước công dân (gắn chip)", "isPermanent": false },
  { "id": "vn_cmnd_cu", "name": "Chứng minh nhân dân (cũ)", "isPermanent": false },
  { "id": "vn_ho_chieu_pho_thong", "name": "Hộ chiếu phổ thông", "isPermanent": false },
  { "id": "vn_ho_chieu_cong_vu", "name": "Hộ chiếu công vụ", "isPermanent": false },
  { "id": "vn_giay_khai_sinh", "name": "Giấy khai sinh", "isPermanent": true },
  { "id": "vn_giay_khai_tu", "name": "Giấy khai tử", "isPermanent": true },
  { "id": "vn_giay_ket_hon", "name": "Giấy chứng nhận kết hôn", "isPermanent": true },
  { "id": "vn_giay_xac_nhan_doc_than", "name": "Giấy xác nhận tình trạng hôn nhân", "isPermanent": false },
  { "id": "vn_so_ho_khau", "name": "Sổ hộ khẩu (ngừng dùng, lưu trữ)", "isPermanent": true },
  { "id": "vn_so_tam_tru", "name": "Sổ/giấy tạm trú", "isPermanent": false },
  { "id": "vn_the_tam_tru", "name": "Thẻ tạm trú (người nước ngoài)", "isPermanent": false },
  { "id": "vn_the_thuong_tru", "name": "Thẻ thường trú (người nước ngoài)", "isPermanent": false },
  { "id": "vn_gplx_a1", "name": "Giấy phép lái xe A1", "isPermanent": true },
  { "id": "vn_gplx_a2", "name": "Giấy phép lái xe A2", "isPermanent": true },
  { "id": "vn_gplx_b1", "name": "Giấy phép lái xe B1", "isPermanent": false },
  { "id": "vn_gplx_b2", "name": "Giấy phép lái xe B2", "isPermanent": false },
  { "id": "vn_gplx_cde", "name": "Giấy phép lái xe C/D/E", "isPermanent": false },
  { "id": "vn_the_bhyt", "name": "Thẻ bảo hiểm y tế", "isPermanent": false },
  { "id": "vn_so_bhxh", "name": "Sổ/Thông tin bảo hiểm xã hội", "isPermanent": true },
  { "id": "vn_bang_tot_nghiep_thpt", "name": "Bằng tốt nghiệp THPT", "isPermanent": true },
  { "id": "vn_bang_tot_nghiep_cao_dang", "name": "Bằng tốt nghiệp Cao đẳng", "isPermanent": true },
  { "id": "vn_bang_tot_nghiep_dai_hoc", "name": "Bằng tốt nghiệp Đại học", "isPermanent": true },
  { "id": "vn_bang_thac_si", "name": "Bằng Thạc sĩ", "isPermanent": true },
  { "id": "vn_bang_tien_si", "name": "Bằng Tiến sĩ", "isPermanent": true },
  { "id": "vn_bang_diem", "name": "Bảng điểm (mọi bậc)", "isPermanent": true },
  { "id": "vn_chung_chi_nghe", "name": "Chứng chỉ nghề", "isPermanent": false },
  { "id": "vn_chung_chi_hanh_nghe_y", "name": "Chứng chỉ hành nghề KCB", "isPermanent": true },
  { "id": "vn_chung_chi_hanh_nghe_duoc", "name": "Chứng chỉ hành nghề dược", "isPermanent": true },
  { "id": "vn_chung_chi_hanh_nghe_xd", "name": "Chứng chỉ hành nghề xây dựng", "isPermanent": true },
  { "id": "vn_chung_chi_ke_toan_kiem_toan", "name": "Chứng chỉ kế toán/kiểm toán", "isPermanent": true },
  { "id": "vn_giay_phep_kinh_doanh", "name": "Giấy chứng nhận đăng ký doanh nghiệp", "isPermanent": true },
  { "id": "vn_mst_ca_nhan", "name": "Mã số thuế cá nhân (xác nhận)", "isPermanent": true },
  { "id": "vn_giay_phep_dkkd_ho_kinh_doanh", "name": "Giấy ĐKKD hộ kinh doanh", "isPermanent": true },
  { "id": "vn_giay_chung_nhan_qsd_dat", "name": "Giấy CN quyền sử dụng đất (Sổ đỏ)", "isPermanent": true },
  { "id": "vn_giay_chung_nhan_so_huu_nha", "name": "Giấy CN quyền sở hữu nhà ở (Sổ hồng)", "isPermanent": true },
  { "id": "vn_ly_lich_tu_phap", "name": "Phiếu lý lịch tư pháp", "isPermanent": false },
  { "id": "vn_giay_xac_nhan_cu_tru", "name": "Giấy xác nhận thông tin cư trú", "isPermanent": false },
  { "id": "vn_giay_xac_nhan_suc_khoe", "name": "Giấy khám/xác nhận sức khoẻ", "isPermanent": false },
  { "id": "int_ielts", "name": "IELTS", "isPermanent": false },
  { "id": "int_toefl", "name": "TOEFL", "isPermanent": false },
  { "id": "int_toeic", "name": "TOEIC", "isPermanent": false },
  { "id": "int_vstep", "name": "VSTEP (VN)", "isPermanent": false },
  { "id": "int_jlpt", "name": "JLPT (Nhật)", "isPermanent": true },
  { "id": "int_topik", "name": "TOPIK (Hàn)", "isPermanent": false },
  { "id": "int_hsk", "name": "HSK (Trung)", "isPermanent": false },
  { "id": "int_delf_dalf", "name": "DELF/DALF (Pháp)", "isPermanent": true },
  { "id": "int_testdaf", "name": "TestDaF (Đức)", "isPermanent": true },
  { "id": "int_mos", "name": "MOS (Microsoft Office Specialist)", "isPermanent": true },
  { "id": "int_ic3", "name": "IC3 Digital Literacy", "isPermanent": true },
  { "id": "int_pmp", "name": "PMP (Project Management Professional)", "isPermanent": false },
  { "id": "int_cisco_ccna", "name": "Cisco CCNA", "isPermanent": false },
  { "id": "int_aws_certified", "name": "AWS Certifications", "isPermanent": false }
]

async function main() {
  await connectDB(config.MONGO_URI)
  
  console.log('Cleaning old credential types data...')
  await CredentialType.deleteMany({})
  console.log('✅ Old data cleaned')
  
  console.log('\nSeeding credential types...')
  
  let created = 0
  
  for (const credType of credentialTypesData) {
    await CredentialType.create(credType)
    created++
    console.log(`Created: ${credType.name}`)
  }
  
  console.log(`\n✅ Done! Created: ${created}, Total: ${credentialTypesData.length}`)
  
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed error:', err)
  process.exit(1)
})

