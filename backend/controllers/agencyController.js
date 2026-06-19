const Agency = require('../models/Agency');
const AgencyActivity = require('../models/AgencyActivity');

// Helper to log agency activities
const logActivity = async (agencyId, action, description, userId) => {
  try {
    await AgencyActivity.create({
      agencyId,
      action,
      description,
      performedBy: userId
    });
  } catch (error) {
    console.error(`Error logging activity: ${error.message}`);
  }
};

// Helper to generate the next unique agency code
const generateNextAgencyCode = async () => {
  try {
    // Retrieve all agency codes (including soft-deleted ones)
    const agencies = await Agency.find({}, 'agencyCode');
    
    let maxNumber = 0;
    agencies.forEach(agency => {
      const code = agency.agencyCode;
      if (code && code.startsWith('AGN')) {
        const numPart = parseInt(code.replace('AGN', ''), 10);
        if (!isNaN(numPart) && numPart > maxNumber) {
          maxNumber = numPart;
        }
      }
    });

    const nextNumber = maxNumber + 1;
    // Format: AGN001, AGN002, AGN010, AGN100 etc.
    const nextCode = `AGN${String(nextNumber).padStart(3, '0')}`;
    return nextCode;
  } catch (error) {
    console.error(`Error generating agency code: ${error.message}`);
    throw new Error('Could not generate unique agency code');
  }
};

// @desc    Get agency statistics
// @route   GET /api/agencies/stats
// @access  Private
const getAgencyStats = async (req, res) => {
  try {
    const stats = await Agency.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalAgencies: { $sum: 1 },
          activeAgencies: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          inactiveAgencies: {
            $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
          },
          blockedAgencies: {
            $sum: { $cond: [{ $eq: ['$isBlocked', true] }, 1, 0] }
          },
          preferredAgencies: {
            $sum: { $cond: [{ $eq: ['$isPreferredSupplier', true] }, 1, 0] }
          },
          totalOutstandingBalance: { $sum: '$currentBalance' }
        }
      }
    ]);

    const result = stats[0] || {
      totalAgencies: 0,
      activeAgencies: 0,
      inactiveAgencies: 0,
      blockedAgencies: 0,
      preferredAgencies: 0,
      totalOutstandingBalance: 0
    };

    res.json({
      success: true,
      stats: {
        totalAgencies: result.totalAgencies,
        activeAgencies: result.activeAgencies,
        inactiveAgencies: result.inactiveAgencies,
        blockedAgencies: result.blockedAgencies,
        preferredAgencies: result.preferredAgencies,
        totalOutstandingBalance: result.totalOutstandingBalance
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving statistics' });
  }
};

// @desc    Get all agencies with filters, search, pagination, and sorting
// @route   GET /api/agencies
// @access  Private
const getAgencies = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status, 
      category, 
      type, // 'preferred' or 'normal'
      blocked, // 'true' or 'false'
      sort = 'latest'
    } = req.query;

    const query = { isDeleted: false };

    // Search filter: Matches agencyName or phone
    if (search) {
      query.$or = [
        { agencyName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status && ['active', 'inactive'].includes(status)) {
      query.status = status;
    }

    // Category filter
    if (category && ['Manufacturer', 'Wholesaler', 'Distributor', 'Local Supplier'].includes(category)) {
      query.agencyCategory = category;
    }

    // Preferred supplier filter
    if (type === 'preferred') {
      query.isPreferredSupplier = true;
    } else if (type === 'normal') {
      query.isPreferredSupplier = false;
    }

    // Blocked filter
    if (blocked === 'true') {
      query.isBlocked = true;
    } else if (blocked === 'false') {
      query.isBlocked = false;
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    let sortQuery = { createdAt: -1 }; // default: latest created
    if (sort === 'oldest') {
      sortQuery = { createdAt: 1 };
    } else if (sort === 'name_asc') {
      sortQuery = { agencyName: 1 };
    } else if (sort === 'name_desc') {
      sortQuery = { agencyName: -1 };
    } else if (sort === 'balance_desc') {
      sortQuery = { currentBalance: -1 };
    }

    const agencies = await Agency.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    const total = await Agency.countDocuments(query);

    res.json({
      success: true,
      agencies,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving agencies' });
  }
};

// @desc    Get single agency by ID
// @route   GET /api/agencies/:id
// @access  Private
const getAgencyById = async (req, res) => {
  try {
    const agency = await Agency.findOne({ _id: req.params.id, isDeleted: false })
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    res.json({ success: true, agency });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving agency details' });
  }
};

// @desc    Create new agency
// @route   POST /api/agencies
// @access  Private
const createAgency = async (req, res) => {
  try {
    // Generate unique code
    const agencyCode = await generateNextAgencyCode();

    // Check if email unique if provided
    if (req.body.email) {
      const emailExists = await Agency.findOne({ email: req.body.email.toLowerCase(), isDeleted: false });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email is already registered' });
      }
    }

    const agencyData = {
      ...req.body,
      agencyCode,
      createdBy: req.user.id
    };

    const agency = await Agency.create(agencyData);

    // Log the creation activity
    await logActivity(
      agency._id,
      'Agency Created',
      `Agency registered with code ${agency.agencyCode} by ${req.user.name}`,
      req.user.id
    );

    res.status(201).json({ success: true, agency });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error creating agency' });
  }
};

// @desc    Update agency
// @route   PUT /api/agencies/:id
// @access  Private
const updateAgency = async (req, res) => {
  try {
    let agency = await Agency.findOne({ _id: req.params.id, isDeleted: false });

    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    // Check unique email if changing
    if (req.body.email && req.body.email.toLowerCase() !== agency.email) {
      const emailExists = await Agency.findOne({ email: req.body.email.toLowerCase(), isDeleted: false });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email is already registered' });
      }
    }

    // Check for audit changes
    const creditLimitChanged = req.body.creditLimit !== undefined && Number(req.body.creditLimit) !== agency.creditLimit;
    const statusChanged = req.body.status !== undefined && req.body.status !== agency.status;
    const blockStateChanged = req.body.isBlocked !== undefined && req.body.isBlocked !== agency.isBlocked;

    const updatedData = {
      ...req.body,
      updatedBy: req.user.id
    };

    // Prevent direct modification of agencyCode
    delete updatedData.agencyCode;

    agency = await Agency.findByIdAndUpdate(req.params.id, updatedData, {
      new: true,
      runValidators: true
    });

    // Activities Log details
    let activityAction = 'Agency Updated';
    let activityDesc = `Agency details updated by ${req.user.name}`;

    if (creditLimitChanged) {
      activityAction = 'Credit Limit Changed';
      activityDesc = `Credit limit modified to ₹${agency.creditLimit} by ${req.user.name}`;
      await logActivity(agency._id, activityAction, activityDesc, req.user.id);
    }
    
    if (statusChanged) {
      activityAction = agency.status === 'active' ? 'Agency Activated' : 'Agency Marked Inactive';
      activityDesc = `Status changed to ${agency.status} by ${req.user.name}`;
      await logActivity(agency._id, activityAction, activityDesc, req.user.id);
    }

    if (blockStateChanged) {
      activityAction = agency.isBlocked ? 'Agency Blocked' : 'Agency Unblocked';
      activityDesc = agency.isBlocked 
        ? `Agency blocked due to business constraints by ${req.user.name}`
        : `Agency unblocked and marked active by ${req.user.name}`;
      await logActivity(agency._id, activityAction, activityDesc, req.user.id);
    }

    // Log generic update if no specific audit flags triggered
    if (!creditLimitChanged && !statusChanged && !blockStateChanged) {
      await logActivity(agency._id, activityAction, activityDesc, req.user.id);
    }

    res.json({ success: true, agency });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error updating agency' });
  }
};

// @desc    Soft delete agency
// @route   DELETE /api/agencies/:id
// @access  Private
const deleteAgency = async (req, res) => {
  try {
    const agency = await Agency.findOne({ _id: req.params.id, isDeleted: false });

    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    // Set soft-delete
    agency.isDeleted = true;
    agency.status = 'inactive';
    agency.updatedBy = req.user.id;
    await agency.save();

    // Log delete action
    await logActivity(
      agency._id,
      'Agency Deleted',
      `Agency was soft-deleted by ${req.user.name}. Reference preserved for audit logic.`,
      req.user.id
    );

    res.json({ success: true, message: 'Agency soft deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error deleting agency' });
  }
};

// @desc    Get activity logs of an agency
// @route   GET /api/agencies/:id/activities
// @access  Private
const getAgencyActivities = async (req, res) => {
  try {
    const activities = await AgencyActivity.find({ agencyId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name');

    res.json({ success: true, activities });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving logs' });
  }
};

// Helper to compile reports into CSV string
const generateCSV = (headers, rows) => {
  const headerLine = headers.join(',');
  const rowLines = rows.map(row => 
    row.map(val => {
      if (val === null || val === undefined) return '';
      const stringVal = String(val);
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    }).join(',')
  );
  return [headerLine, ...rowLines].join('\n');
};

// @desc    Export Excel (CSV)
// @route   GET /api/agencies/export/excel
// @access  Private
const exportAgenciesExcel = async (req, res) => {
  try {
    const { 
      search = '', 
      status, 
      category, 
      type, 
      blocked, 
      sort = 'latest'
    } = req.query;

    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { agencyName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && ['active', 'inactive'].includes(status)) {
      query.status = status;
    }

    if (category && ['Manufacturer', 'Wholesaler', 'Distributor', 'Local Supplier'].includes(category)) {
      query.agencyCategory = category;
    }

    if (type === 'preferred') {
      query.isPreferredSupplier = true;
    } else if (type === 'normal') {
      query.isPreferredSupplier = false;
    }

    if (blocked === 'true') {
      query.isBlocked = true;
    } else if (blocked === 'false') {
      query.isBlocked = false;
    }

    let sortQuery = { createdAt: -1 };
    if (sort === 'oldest') {
      sortQuery = { createdAt: 1 };
    } else if (sort === 'name_asc') {
      sortQuery = { agencyName: 1 };
    } else if (sort === 'name_desc') {
      sortQuery = { agencyName: -1 };
    } else if (sort === 'balance_desc') {
      sortQuery = { currentBalance: -1 };
    }

    const agencies = await Agency.find(query).sort(sortQuery);

    const headers = ['Agency Code', 'Agency Name', 'Contact Person', 'Designation', 'Phone', 'Email', 'GSTIN', 'Drug License', 'Address', 'City', 'State', 'Pincode', 'Category', 'Preferred', 'Blocked', 'Credit Days', 'Credit Limit', 'Current Balance', 'Status'];
    const rows = agencies.map(a => [
      a.agencyCode,
      a.agencyName,
      a.contactPerson || '',
      a.contactPersonDesignation || '',
      a.phone,
      a.email || '',
      a.gstNumber || '',
      a.drugLicenseNumber || '',
      a.address || '',
      a.city || '',
      a.state || '',
      a.pincode || '',
      a.agencyCategory,
      a.isPreferredSupplier ? 'Yes' : 'No',
      a.isBlocked ? 'Yes' : 'No',
      a.creditDays || 0,
      a.creditLimit || 0,
      a.currentBalance || 0,
      a.status
    ]);

    const csvContent = generateCSV(headers, rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Agencies_Report_${Date.now()}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error exporting agencies CSV:', error);
    return res.status(500).json({ success: false, message: 'Server error exporting agencies to CSV' });
  }
};

// @desc    Export PDF (Text layout)
// @route   GET /api/agencies/export/pdf
// @access  Private
const exportAgenciesPdf = async (req, res) => {
  try {
    const { 
      search = '', 
      status, 
      category, 
      type, 
      blocked, 
      sort = 'latest'
    } = req.query;

    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { agencyName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && ['active', 'inactive'].includes(status)) {
      query.status = status;
    }

    if (category && ['Manufacturer', 'Wholesaler', 'Distributor', 'Local Supplier'].includes(category)) {
      query.agencyCategory = category;
    }

    if (type === 'preferred') {
      query.isPreferredSupplier = true;
    } else if (type === 'normal') {
      query.isPreferredSupplier = false;
    }

    if (blocked === 'true') {
      query.isBlocked = true;
    } else if (blocked === 'false') {
      query.isBlocked = false;
    }

    let sortQuery = { createdAt: -1 };
    if (sort === 'oldest') {
      sortQuery = { createdAt: 1 };
    } else if (sort === 'name_asc') {
      sortQuery = { agencyName: 1 };
    } else if (sort === 'name_desc') {
      sortQuery = { agencyName: -1 };
    } else if (sort === 'balance_desc') {
      sortQuery = { currentBalance: -1 };
    }

    const agencies = await Agency.find(query).sort(sortQuery);

    const headers = ['Code', 'Agency Name', 'Contact Person', 'Phone', 'Limit', 'Balance', 'Category', 'Status'];
    const rows = agencies.map(a => [
      a.agencyCode,
      a.agencyName,
      a.contactPerson || '',
      a.phone,
      String(a.creditLimit || 0),
      String(a.currentBalance || 0),
      a.agencyCategory,
      a.status
    ]);

    const csvContent = generateCSV(headers, rows);
    const textReport = `==================================================\nKASHTBHANJAN PHARMACY - AGENCIES SUPPLIER REPORT\nGenerated At: ${new Date().toLocaleString()}\n==================================================\n\n` + csvContent;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="Agencies_Report_${Date.now()}.txt"`);
    return res.status(200).send(textReport);
  } catch (error) {
    console.error('Error exporting agencies PDF:', error);
    return res.status(500).json({ success: false, message: 'Server error exporting agencies to PDF' });
  }
};

module.exports = {
  getAgencyStats,
  getAgencies,
  getAgencyById,
  createAgency,
  updateAgency,
  deleteAgency,
  getAgencyActivities,
  exportAgenciesExcel,
  exportAgenciesPdf
};
