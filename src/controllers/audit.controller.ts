import { Request, Response } from 'express'
import AuditLog, { AuditAction, AuditStatus } from '../models/audit-log.model'

export async function listAuditLogs(req: any, res: Response) {
  try {
    const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '20', 10) || 20, 1), 100)
    
    // Filters
    const userId = req.query.userId?.toString()
    const userRole = req.query.userRole?.toString().toUpperCase()
    const action = req.query.action?.toString().toUpperCase()
    const status = req.query.status?.toString().toUpperCase()
    const resourceType = req.query.resourceType?.toString()
    const resourceId = req.query.resourceId?.toString()
    const startDate = req.query.startDate?.toString()
    const endDate = req.query.endDate?.toString()
    const search = req.query.search?.toString().trim()

    // Build filter
    const filter: any = {}

    if (userId) {
      filter.userId = userId
    }

    if (userRole && ['USER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      filter.userRole = userRole
    }

    if (action && Object.values(AuditAction).includes(action as AuditAction)) {
      filter.action = action
    }

    if (status && Object.values(AuditStatus).includes(status as AuditStatus)) {
      filter.status = status
    }

    if (resourceType) {
      filter.resourceType = resourceType
    }

    if (resourceId) {
      filter.resourceId = resourceId
    }

    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) {
        // Set startDate về đầu ngày (00:00:00.000)
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        filter.createdAt.$gte = start
      }
      if (endDate) {
        // Set endDate về cuối ngày (23:59:59.999) để bao gồm cả ngày đó
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = end
      }
    }

    if (search) {
      filter.$or = [
        { userEmail: { $regex: search, $options: 'i' } },
        { resourceId: { $regex: search, $options: 'i' } },
        { errorMessage: { $regex: search, $options: 'i' } },
      ]
    }

    // Count total
    const total = await AuditLog.countDocuments(filter)
    const totalPages = Math.max(Math.ceil(total / limit), 1)
    const currentPage = Math.min(page, totalPages)

    // Fetch logs
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .lean()

    res.json({
      logs,
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages,
      },
    })
  } catch (error: any) {
    console.error('List audit logs error:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy audit logs' })
  }
}

export async function getAuditStats(req: any, res: Response) {
  try {
    let startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 ngày trước
    let endDate = req.query.endDate ? new Date(req.query.endDate) : new Date()

    // Set startDate về đầu ngày (00:00:00.000)
    startDate.setHours(0, 0, 0, 0)
    // Set endDate về cuối ngày (23:59:59.999) để bao gồm cả ngày đó
    endDate.setHours(23, 59, 59, 999)

    const filter = {
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    }

    // Stats by action
    const actionStats = await AuditLog.aggregate([
      { $match: filter },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])

    // Stats by status
    const statusStats = await AuditLog.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])

    // Stats by role
    const roleStats = await AuditLog.aggregate([
      { $match: filter },
      { $group: { _id: '$userRole', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])

    // Total logs
    const totalLogs = await AuditLog.countDocuments(filter)

    res.json({
      totalLogs,
      actionStats,
      statusStats,
      roleStats,
      period: {
        startDate,
        endDate,
      },
    })
  } catch (error: any) {
    console.error('Get audit stats error:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy audit stats' })
  }
}

