import mongoose from 'mongoose'
import CredentialValidityOption from '../src/models/credential-validity-option.model'
import { config } from '../src/utils/env'
import { connectDB } from '../src/config/db'

const validityOptionsData = [
  // ============================================
  // VN - Hộ chiếu
  // ============================================
  { "id": "opt_passport_60", "credentialTypeId": "vn_ho_chieu_pho_thong", "periodMonths": 60, "periodDays": null, "note": "<14 tuổi: 5 năm" },
  { "id": "opt_passport_120", "credentialTypeId": "vn_ho_chieu_pho_thong", "periodMonths": 120, "periodDays": null, "note": ">=14 tuổi: 10 năm" },
  { "id": "opt_official_passport_60", "credentialTypeId": "vn_ho_chieu_cong_vu", "periodMonths": 60, "periodDays": null, "note": "Thường 5 năm" },
  
  // ============================================
  // VN - Cư trú
  // ============================================
  { "id": "opt_tamtru_sach_12", "credentialTypeId": "vn_so_tam_tru", "periodMonths": 12, "periodDays": null, "note": "Gia hạn định kỳ" },
  { "id": "opt_tamtru_12", "credentialTypeId": "vn_the_tam_tru", "periodMonths": 12, "periodDays": null, "note": "Có thể 1–3 năm" },
  { "id": "opt_tamtru_24", "credentialTypeId": "vn_the_tam_tru", "periodMonths": 24, "periodDays": null, "note": "Có thể 1–3 năm" },
  { "id": "opt_tamtru_36", "credentialTypeId": "vn_the_tam_tru", "periodMonths": 36, "periodDays": null, "note": "Có thể 1–3 năm" },
  { "id": "opt_thuongtru_120", "credentialTypeId": "vn_the_thuong_tru", "periodMonths": 120, "periodDays": null, "note": "Thẻ thường trú 10 năm" },
  
  // ============================================
  // VN - Giấy phép lái xe
  // ============================================
  { "id": "opt_gplx_b1_120", "credentialTypeId": "vn_gplx_b1", "periodMonths": 120, "periodDays": null, "note": "Thường 10 năm" },
  { "id": "opt_gplx_b2_120", "credentialTypeId": "vn_gplx_b2", "periodMonths": 120, "periodDays": null, "note": "Thường 10 năm" },
  { "id": "opt_gplx_cde_60", "credentialTypeId": "vn_gplx_cde", "periodMonths": 60, "periodDays": null, "note": "C/D/E thường 5 năm" },
  
  // ============================================
  // VN - Bảo hiểm
  // ============================================
  { "id": "opt_bhyt_6", "credentialTypeId": "vn_the_bhyt", "periodMonths": 6, "periodDays": null, "note": "Một số nhóm 6 tháng" },
  { "id": "opt_bhyt_12", "credentialTypeId": "vn_the_bhyt", "periodMonths": 12, "periodDays": null, "note": "Thông dụng: 12 tháng" },
  
  // ============================================
  // VN - Giấy tờ khác
  // ============================================
  { "id": "opt_doc_than_6", "credentialTypeId": "vn_giay_xac_nhan_doc_than", "periodMonths": 6, "periodDays": null, "note": "Thường hiệu lực 6 tháng" },
  { "id": "opt_lltp_6", "credentialTypeId": "vn_ly_lich_tu_phap", "periodMonths": 6, "periodDays": null, "note": "Thông dụng: 6 tháng" },
  { "id": "opt_cu_tru_6", "credentialTypeId": "vn_giay_xac_nhan_cu_tru", "periodMonths": 6, "periodDays": null, "note": "Thường 6 tháng" },
  { "id": "opt_suc_khoe_6", "credentialTypeId": "vn_giay_xac_nhan_suc_khoe", "periodMonths": 6, "periodDays": null, "note": "Nhiều nơi yêu cầu <6 tháng" },
  
  // ============================================
  // International - Chứng chỉ tiếng Anh
  // ============================================
  { "id": "opt_ielts_24", "credentialTypeId": "int_ielts", "periodMonths": 24, "periodDays": null, "note": "IELTS 2 năm" },
  { "id": "opt_toefl_24", "credentialTypeId": "int_toefl", "periodMonths": 24, "periodDays": null, "note": "TOEFL 2 năm" },
  { "id": "opt_toeic_24", "credentialTypeId": "int_toeic", "periodMonths": 24, "periodDays": null, "note": "TOEIC 2 năm" },
  { "id": "opt_vstep_24", "credentialTypeId": "int_vstep", "periodMonths": 24, "periodDays": null, "note": "VSTEP 2 năm (thực tế tùy đơn vị sử dụng)" },
  
  // ============================================
  // International - Chứng chỉ tiếng khác
  // ============================================
  { "id": "opt_topik_24", "credentialTypeId": "int_topik", "periodMonths": 24, "periodDays": null, "note": "TOPIK 2 năm" },
  { "id": "opt_hsk_24", "credentialTypeId": "int_hsk", "periodMonths": 24, "periodDays": null, "note": "HSK 2 năm" },
  
  // ============================================
  // International - Chứng chỉ chuyên nghiệp
  // ============================================
  { "id": "opt_pmp_36", "credentialTypeId": "int_pmp", "periodMonths": 36, "periodDays": null, "note": "PMP 3 năm" },
  { "id": "opt_ccna_36", "credentialTypeId": "int_cisco_ccna", "periodMonths": 36, "periodDays": null, "note": "CCNA 3 năm" },
  { "id": "opt_aws_36", "credentialTypeId": "int_aws_certified", "periodMonths": 36, "periodDays": null, "note": "AWS 3 năm" },

   // ============================================
  // International - Chứng chỉ nghề
  // ============================================
  {"id":"opt_cc_nghe_6","credentialTypeId":"vn_chung_chi_nghe","periodMonths":6,"periodDays":null,"note":"Một số khoá/ngành yêu cầu hiệu lực 6 tháng"},
  { "id": "opt_cc_nghe_12", "credentialTypeId": "vn_chung_chi_nghe", "periodMonths": 12, "periodDays": null, "note": "Thông dụng 12 tháng tuỳ quy định nơi sử dụng" },
  { "id": "opt_cc_nghe_24", "credentialTypeId": "vn_chung_chi_nghe", "periodMonths": 24, "periodDays": null, "note": "Nhiều lĩnh vực yêu cầu bồi dưỡng lại mỗi 2 năm" },
  { "id": "opt_cc_nghe_36", "credentialTypeId": "vn_chung_chi_nghe", "periodMonths": 36, "periodDays": null, "note": "Một số chứng chỉ chấp nhận tối đa 3 năm" }

]

async function main() {
  await connectDB(config.MONGO_URI)
  
  console.log('Cleaning old credential validity options data...')
  await CredentialValidityOption.deleteMany({})
  console.log('✅ Old data cleaned')
  
  console.log('\nSeeding credential validity options...')
  
  let created = 0
  
  for (const option of validityOptionsData) {
    await CredentialValidityOption.create(option)
    created++
    console.log(`Created: ${option.id} (${option.credentialTypeId})`)
  }
  
  console.log(`\n✅ Done! Created: ${created}, Total: ${validityOptionsData.length}`)
  
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed error:', err)
  process.exit(1)
})

