import CredentialValidityOption from '../models/credential-validity-option.model'
import CredentialType from '../models/credential-type.model'

// Lấy danh sách validity options theo credentialTypeId
export async function listValidityOptions(req: any, res: any) {
  try {
    const { credentialTypeId } = req.query
    
    const filter: any = {}
    if (credentialTypeId) {
      filter.credentialTypeId = credentialTypeId
    }
    
    const options = await CredentialValidityOption.find(filter).sort({ periodMonths: 1, periodDays: 1 })
    
    res.json({
      items: options,
      total: options.length
    })
  } catch (error: any) {
    console.error('Error listing validity options:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy danh sách tùy chọn thời hạn' })
  }
}

// Lấy một validity option theo ID
export async function getValidityOptionById(req: any, res: any) {
  try {
    const { id } = req.params
    const option = await CredentialValidityOption.findOne({ id })
    
    if (!option) {
      return res.status(404).json({ message: 'Không tìm thấy tùy chọn thời hạn' })
    }
    
    res.json(option)
  } catch (error: any) {
    console.error('Error getting validity option:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy thông tin tùy chọn thời hạn' })
  }
}

// Tạo validity option mới (Admin only)
export async function createValidityOption(req: any, res: any) {
  try {
    const { id, credentialTypeId, periodMonths, periodDays, note } = req.body
    
    if (!id || !credentialTypeId) {
      return res.status(400).json({ message: 'Thiếu thông tin: id, credentialTypeId' })
    }
    
    if (periodMonths === null && periodDays === null) {
      return res.status(400).json({ message: 'Cần có ít nhất một trong hai: periodMonths hoặc periodDays' })
    }
    
    // Kiểm tra credentialTypeId có tồn tại không
    const credentialType = await CredentialType.findOne({ id: credentialTypeId })
    if (!credentialType) {
      return res.status(400).json({ message: 'Không tìm thấy loại văn bằng với ID này' })
    }
    
    // Kiểm tra id đã tồn tại chưa
    const existing = await CredentialValidityOption.findOne({ id })
    if (existing) {
      return res.status(400).json({ message: 'ID đã tồn tại' })
    }
    
    const option = await CredentialValidityOption.create({
      id,
      credentialTypeId,
      periodMonths: periodMonths || null,
      periodDays: periodDays || null,
      note: note || null
    })
    
    res.status(201).json(option)
  } catch (error: any) {
    console.error('Error creating validity option:', error)
    if (error.code === 11000) {
      return res.status(400).json({ message: 'ID đã tồn tại' })
    }
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi tạo tùy chọn thời hạn' })
  }
}

// Cập nhật validity option (Admin only)
export async function updateValidityOption(req: any, res: any) {
  try {
    const { id } = req.params
    const { credentialTypeId, periodMonths, periodDays, note } = req.body
    
    const option = await CredentialValidityOption.findOne({ id })
    if (!option) {
      return res.status(404).json({ message: 'Không tìm thấy tùy chọn thời hạn' })
    }
    
    if (credentialTypeId !== undefined) {
      // Kiểm tra credentialTypeId có tồn tại không
      const credentialType = await CredentialType.findOne({ id: credentialTypeId })
      if (!credentialType) {
        return res.status(400).json({ message: 'Không tìm thấy loại văn bằng với ID này' })
      }
      option.credentialTypeId = credentialTypeId
    }
    
    if (periodMonths !== undefined) option.periodMonths = periodMonths || null
    if (periodDays !== undefined) option.periodDays = periodDays || null
    if (note !== undefined) option.note = note || null
    
    // Validate: cần có ít nhất một trong hai
    if (option.periodMonths === null && option.periodDays === null) {
      return res.status(400).json({ message: 'Cần có ít nhất một trong hai: periodMonths hoặc periodDays' })
    }
    
    await option.save()
    
    res.json(option)
  } catch (error: any) {
    console.error('Error updating validity option:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi cập nhật tùy chọn thời hạn' })
  }
}

// Xóa validity option (Admin only)
export async function deleteValidityOption(req: any, res: any) {
  try {
    const { id } = req.params
    
    const option = await CredentialValidityOption.findOne({ id })
    if (!option) {
      return res.status(404).json({ message: 'Không tìm thấy tùy chọn thời hạn' })
    }
    
    await CredentialValidityOption.deleteOne({ id })
    
    res.json({ message: 'Đã xóa tùy chọn thời hạn thành công' })
  } catch (error: any) {
    console.error('Error deleting validity option:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi xóa tùy chọn thời hạn' })
  }
}

