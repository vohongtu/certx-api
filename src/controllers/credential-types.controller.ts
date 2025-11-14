import CredentialType from '../models/credential-type.model'
import CredentialValidityOption from '../models/credential-validity-option.model'

// Lấy danh sách tất cả credential types
export async function listCredentialTypes(req: any, res: any) {
  try {
    const { q, page, limit } = req.query // Query string để search, pagination
    const filter: any = {}
    
    if (q && q.trim()) {
      // Tìm kiếm theo name hoặc id (case-insensitive)
      filter.$or = [
        { name: { $regex: q.trim(), $options: 'i' } },
        { id: { $regex: q.trim(), $options: 'i' } }
      ]
    }
    
    // Pagination
    const pageNum = parseInt(page) || 1
    const limitNum = parseInt(limit) || 10
    const skip = (pageNum - 1) * limitNum
    
    // Get total count
    const total = await CredentialType.countDocuments(filter)
    
    // Get paginated results
    const credentialTypes = await CredentialType.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum)
    
    const totalPages = Math.ceil(total / limitNum)
    
    res.json({
      items: credentialTypes,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    })
  } catch (error: any) {
    console.error('Error listing credential types:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy danh sách loại văn bằng' })
  }
}

// Lấy một credential type theo ID
export async function getCredentialTypeById(req: any, res: any) {
  try {
    const { id } = req.params
    const credentialType = await CredentialType.findOne({ id })
    
    if (!credentialType) {
      return res.status(404).json({ message: 'Không tìm thấy loại văn bằng' })
    }
    
    res.json(credentialType)
  } catch (error: any) {
    console.error('Error getting credential type:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy thông tin loại văn bằng' })
  }
}

// Tạo credential type mới (Admin only)
export async function createCredentialType(req: any, res: any) {
  try {
    const { id, name, isPermanent } = req.body
    
    if (!id || !name || typeof isPermanent !== 'boolean') {
      return res.status(400).json({ message: 'Thiếu thông tin: id, name, isPermanent' })
    }
    
    // Kiểm tra id đã tồn tại chưa
    const existing = await CredentialType.findOne({ id })
    if (existing) {
      return res.status(400).json({ message: 'ID đã tồn tại' })
    }
    
    const credentialType = await CredentialType.create({
      id,
      name,
      isPermanent
    })
    
    res.status(201).json(credentialType)
  } catch (error: any) {
    console.error('Error creating credential type:', error)
    if (error.code === 11000) {
      return res.status(400).json({ message: 'ID đã tồn tại' })
    }
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi tạo loại văn bằng' })
  }
}

// Cập nhật credential type (Admin only)
export async function updateCredentialType(req: any, res: any) {
  try {
    const { id } = req.params
    const { name, isPermanent } = req.body
    
    const credentialType = await CredentialType.findOne({ id })
    if (!credentialType) {
      return res.status(404).json({ message: 'Không tìm thấy loại văn bằng' })
    }
    
    if (name !== undefined) credentialType.name = name
    if (isPermanent !== undefined) credentialType.isPermanent = isPermanent
    
    await credentialType.save()
    
    res.json(credentialType)
  } catch (error: any) {
    console.error('Error updating credential type:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi cập nhật loại văn bằng' })
  }
}

// Xóa credential type (Admin only)
export async function deleteCredentialType(req: any, res: any) {
  try {
    const { id } = req.params
    
    const credentialType = await CredentialType.findOne({ id })
    if (!credentialType) {
      return res.status(404).json({ message: 'Không tìm thấy loại văn bằng' })
    }
    
    // Kiểm tra xem có validity options nào đang sử dụng credential type này không
    const validityOptionsCount = await CredentialValidityOption.countDocuments({ credentialTypeId: id })
    if (validityOptionsCount > 0) {
      return res.status(400).json({ 
        message: `Không thể xóa loại văn bằng này vì đang có ${validityOptionsCount} tùy chọn thời hạn đang sử dụng. Vui lòng xóa các tùy chọn thời hạn trước.` 
      })
    }
    
    await CredentialType.deleteOne({ id })
    
    res.json({ message: 'Đã xóa loại văn bằng thành công' })
  } catch (error: any) {
    console.error('Error deleting credential type:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi xóa loại văn bằng' })
  }
}

